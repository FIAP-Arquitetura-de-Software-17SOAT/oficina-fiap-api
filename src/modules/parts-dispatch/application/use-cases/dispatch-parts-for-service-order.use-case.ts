import { DispatchResult, PartRequirement } from '../contracts/dispatch-result';
import { PartsDispatchApplicationError } from '../errors/parts-dispatch-application.error';
import {
  AcceptedBudget,
  AcceptedBudgetsPort,
} from '../ports/accepted-budgets.port';
import { ServiceOrderDispatchPort } from '../ports/service-order-dispatch.port';
import { ShortagePurchasePort } from '../ports/shortage-purchase.port';
import { StockPort } from '../ports/stock.port';

/**
 * Implementa a ponta de estoque das políticas do Event Storming:
 *
 * - "Quando o estoque for consultado e tiver peças disponíveis, o estoque será
 *   subtraído conforme a quantidade de peças solicitadas."
 * - "Quando o estoque for atualizado o Status da OS será alterado para em
 *   execução."
 * - "Quando o estoque for consultado, caso não tenha peças suficientes, o
 *   estoquista irá registrar necessidade de compra."
 *
 * É uma orquestração entre quatro agregados (orçamento, estoque, OS e pedido de
 * compra), por isso mora num módulo próprio e fala com cada um por uma porta.
 */
export class DispatchPartsForServiceOrderUseCase {
  constructor(
    private readonly budgets: AcceptedBudgetsPort,
    private readonly stock: StockPort,
    private readonly serviceOrders: ServiceOrderDispatchPort,
    private readonly purchases: ShortagePurchasePort,
  ) {}

  async execute(serviceOrderId: string): Promise<DispatchResult> {
    const budget = await this.findAcceptedBudget(serviceOrderId);
    const requirements = await this.resolveRequirements(budget);
    const shortages = requirements.filter(
      (requirement) => requirement.available < requirement.required,
    );

    if (shortages.length > 0) {
      return this.registerShortages(serviceOrderId, requirements, shortages);
    }

    return this.dispatch(serviceOrderId, budget, requirements);
  }

  /**
   * Uma OS pode ter vários orçamentos — reparos adicionais aprovados durante a
   * execução. O que vale para o estoque é o aceito de maior versão.
   */
  private async findAcceptedBudget(
    serviceOrderId: string,
  ): Promise<AcceptedBudget> {
    const accepted = (await this.budgets.findAccepted(serviceOrderId)).sort(
      (first, second) => second.version - first.version,
    );

    if (accepted.length === 0) {
      throw new PartsDispatchApplicationError('NO_ACCEPTED_BUDGET');
    }

    return accepted[0];
  }

  private async resolveRequirements(
    budget: AcceptedBudget,
  ): Promise<PartRequirement[]> {
    // Orçamento só de serviços não tem o que baixar. Não é erro: a OS passa pela
    // solicitação de peças como qualquer outra e sai daqui liberada.

    // Retaguarda: o orçamento passou a recusar item de peça sem referência na
    // montagem, e o banco tem CHECK para isso. Só chega aqui linha anterior à
    // migration 20260829180000_require_budget_item_part_ref.
    const unreferenced = budget.partItems.filter((item) => !item.partId);

    if (unreferenced.length > 0) {
      throw new PartsDispatchApplicationError('PART_ITEM_WITHOUT_REFERENCE', {
        descriptions: unreferenced.map((item) => item.description),
      });
    }

    const requirements: PartRequirement[] = [];

    for (const item of budget.partItems) {
      const part = await this.stock.findPart(item.partId!);

      if (!part) {
        throw new PartsDispatchApplicationError('PART_NOT_FOUND');
      }

      requirements.push({
        partId: part.id,
        partName: part.name,
        // O item de orçamento aceita fração — 2,5 litros de óleo — mas o
        // estoque é contado em unidades inteiras. Arredondar para cima é o que
        // não deixa a OS sair com menos do que precisa.
        required: Math.ceil(Number(item.quantity)),
        available: part.quantity,
      });
    }

    return requirements;
  }

  private async registerShortages(
    serviceOrderId: string,
    requirements: PartRequirement[],
    shortages: PartRequirement[],
  ): Promise<DispatchResult> {
    const purchaseOrder = await this.purchases.registerShortage(
      shortages.map((shortage) => ({
        partId: shortage.partId,
        quantity: shortage.required - shortage.available,
      })),
    );

    return {
      serviceOrderId,
      dispatched: false,
      purchaseOrderId: purchaseOrder.id,
      requirements,
    };
  }

  private async dispatch(
    serviceOrderId: string,
    budget: AcceptedBudget,
    requirements: PartRequirement[],
  ): Promise<DispatchResult> {
    for (const requirement of requirements) {
      await this.stock.decrease(
        requirement.partId,
        requirement.required,
        // Deriva do orçamento e da peça: repetir o despacho da mesma OS não
        // baixa o estoque duas vezes.
        `budget:${budget.id}:part:${requirement.partId}`,
      );
    }

    await this.serviceOrders.registerPartsDispatched(serviceOrderId);

    return {
      serviceOrderId,
      dispatched: true,
      purchaseOrderId: null,
      requirements,
    };
  }
}

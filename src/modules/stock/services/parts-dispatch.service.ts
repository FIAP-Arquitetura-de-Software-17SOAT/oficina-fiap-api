import {
  BadRequestException,
  Inject,
  Injectable,
  forwardRef,
} from '@nestjs/common';
import { BudgetController } from '../../budget/controllers/budget.controller';
import {
  BudgetItemResponseDto,
  BudgetResponseDto,
} from '../../budget/dto/budget.dto';
import {
  BudgetItemType,
  BudgetStatus,
} from '../../budget/entities/budget.entity';
import { PurchaseOrderController } from '../../purchase-order/controllers/purchase-order.controller';
import { ServiceOrderController } from '../../service-order/controllers/service-order.controller';
import {
  PartsDispatchResponseDto,
  PartRequirementDto,
} from '../dto/parts-dispatch.dto';
import { PartService } from './part.service';
import { StockMovementService } from './stock-movement.service';

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
 * As peças a atender saem do orçamento aceito da OS — é ele que carrega o
 * snapshot do que o cliente aprovou. Os outros agregados são alcançados pelos
 * controllers deles; dentro do próprio estoque a chamada é direta ao service.
 */
@Injectable()
export class PartsDispatchService {
  constructor(
    private readonly partService: PartService,
    private readonly stockMovementService: StockMovementService,
    private readonly budgetController: BudgetController,
    private readonly serviceOrderController: ServiceOrderController,
    @Inject(forwardRef(() => PurchaseOrderController))
    private readonly purchaseOrderController: PurchaseOrderController,
  ) {}

  async dispatchForServiceOrder(
    serviceOrderId: string,
  ): Promise<PartsDispatchResponseDto> {
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
  ): Promise<BudgetResponseDto> {
    const budgets = await this.budgetController.findByServiceOrderId({
      serviceOrderId,
    });

    const accepted = budgets
      .filter((budget) => budget.status === BudgetStatus.ACCEPTED)
      .sort((first, second) => second.version - first.version);

    if (accepted.length === 0) {
      throw new BadRequestException(
        'Service order has no accepted budget to dispatch parts for',
      );
    }

    return accepted[0];
  }

  private async resolveRequirements(
    budget: BudgetResponseDto,
  ): Promise<PartRequirementDto[]> {
    // Orcamento so de servicos nao tem o que baixar. Nao e erro: a OS passa pela
    // solicitacao de pecas como qualquer outra e sai daqui liberada.
    const partItems = budget.items.filter(
      (item) => item.type === BudgetItemType.PART,
    );

    const unreferenced = partItems.filter((item) => !item.partId);

    if (unreferenced.length > 0) {
      throw new BadRequestException(
        `Accepted budget has part items without a part reference: ${unreferenced
          .map((item) => item.description)
          .join(', ')}`,
      );
    }

    const requirements: PartRequirementDto[] = [];

    for (const item of partItems) {
      const part = await this.partService.findById(item.partId!);

      requirements.push({
        partId: item.partId!,
        partName: part.getName(),
        required: this.requiredQuantity(item),
        available: part.getQuantity().getValue(),
      });
    }

    return requirements;
  }

  /**
   * O item de orçamento aceita fração — 2,5 litros de óleo — mas o estoque é
   * contado em unidades inteiras. Arredondar para cima é o que não deixa a OS
   * sair com menos do que precisa.
   */
  private requiredQuantity(item: BudgetItemResponseDto): number {
    return Math.ceil(Number(item.quantity));
  }

  private async registerShortages(
    serviceOrderId: string,
    requirements: PartRequirementDto[],
    shortages: PartRequirementDto[],
  ): Promise<PartsDispatchResponseDto> {
    const purchaseOrder = await this.purchaseOrderController.registerShortage({
      items: shortages.map((shortage) => ({
        partId: shortage.partId,
        quantity: shortage.required - shortage.available,
      })),
    });

    return {
      serviceOrderId,
      dispatched: false,
      purchaseOrderId: purchaseOrder.id,
      requirements,
    };
  }

  private async dispatch(
    serviceOrderId: string,
    budget: BudgetResponseDto,
    requirements: PartRequirementDto[],
  ): Promise<PartsDispatchResponseDto> {
    for (const requirement of requirements) {
      await this.stockMovementService.decrease(requirement.partId, {
        quantity: requirement.required,
        // Deriva do orçamento e da peça: repetir o despacho da mesma OS não
        // baixa o estoque duas vezes.
        idempotencyKey: `budget:${budget.id}:part:${requirement.partId}`,
      });
    }

    await this.serviceOrderController.registerPartsDispatched(serviceOrderId);

    return {
      serviceOrderId,
      dispatched: true,
      purchaseOrderId: null,
      requirements,
    };
  }
}

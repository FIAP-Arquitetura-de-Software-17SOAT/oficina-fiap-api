import { Budget } from '../../domain/entities/budget.entity';
import {
  CreateBudgetInput,
  CreateBudgetItemInput,
} from '../contracts/budget.input';
import { BudgetApplicationError } from '../errors/budget-application.error';
import { BudgetRepositoryPort } from '../ports/budget-repository.port';
import { ServiceOrderPort } from '../ports/service-order.port';
import { BudgetItemReferences } from '../services/budget-item-references';

const MAX_VERSION_ALLOCATION_ATTEMPTS = 3;

/**
 * Recusar orçamento não encerra a OS, então a criação de uma nova versão
 * continua liberada durante toda a negociação. O que não faz sentido é orçar
 * um atendimento que já terminou: OS cancelada, concluída ou entregue não
 * recebe proposta nova.
 */
const CLOSED_SERVICE_ORDER_STATUSES = ['CANCELLED', 'COMPLETED', 'DELIVERED'];

export class CreateBudgetUseCase {
  constructor(
    private readonly budgets: BudgetRepositoryPort,
    private readonly serviceOrders: ServiceOrderPort,
    private readonly references: BudgetItemReferences,
  ) {}

  async execute(input: CreateBudgetInput): Promise<Budget> {
    const serviceOrderId = input.serviceOrderId.trim();

    await this.references.assertExist(input.items);
    await this.assertServiceOrderAcceptsNewBudget(serviceOrderId);
    await this.assertNoBudgetWaitingApproval(serviceOrderId);

    const budget = await this.createWithNextAvailableVersion(
      serviceOrderId,
      input.items,
    );

    // Política do Event Storming: "Quando o orçamento for gerado, o status da
    // OS será alterado para aguardando aprovação". Reparo adicional aprovado
    // durante a execução gera outro orçamento, e a OS já não está mais em
    // diagnóstico — nesse caso a transição não se aplica e o orçamento segue.
    if (budget.getVersion() === 1) {
      await this.serviceOrders.awaitApproval(serviceOrderId);
    }

    return budget;
  }

  private async assertServiceOrderAcceptsNewBudget(
    serviceOrderId: string,
  ): Promise<void> {
    const serviceOrder = await this.serviceOrders.findById(serviceOrderId);
    if (!serviceOrder) {
      throw new BudgetApplicationError('SERVICE_ORDER_NOT_FOUND');
    }
    if (CLOSED_SERVICE_ORDER_STATUSES.includes(serviceOrder.status)) {
      throw new BudgetApplicationError('SERVICE_ORDER_CLOSED', {
        status: serviceOrder.status,
      });
    }
  }

  /**
   * Só um orçamento por vez fica na mão do cliente. Deixar gerar a próxima
   * versão com a anterior ainda aguardando aprovação criava duas propostas
   * abertas para a mesma OS. Para destravar, aceite ou recuse a versão aberta.
   */
  private async assertNoBudgetWaitingApproval(
    serviceOrderId: string,
  ): Promise<void> {
    const waiting =
      await this.budgets.findWaitingApprovalByServiceOrderId(serviceOrderId);
    if (waiting) {
      throw new BudgetApplicationError('BUDGET_WAITING_APPROVAL', {
        version: waiting.getVersion(),
      });
    }
  }

  private async createWithNextAvailableVersion(
    serviceOrderId: string,
    items: CreateBudgetItemInput[],
  ): Promise<Budget> {
    // O `for` sem condição de saída: cada volta ou devolve o orçamento gravado
    // ou lança. Só a perda da corrida de versão, antes da última tentativa,
    // segue para a próxima volta.
    for (let attempt = 1; ; attempt += 1) {
      const lastVersion =
        await this.budgets.findLastVersionByServiceOrderId(serviceOrderId);
      const budget = Budget.create({
        serviceOrderId,
        version: lastVersion + 1,
        items: items.map((item) => BudgetItemReferences.toProps(item)),
      });

      try {
        return await this.budgets.create(budget);
      } catch (error) {
        // Duas requisições alocaram a mesma versão: tenta a próxima.
        const lostRace =
          error instanceof BudgetApplicationError &&
          error.code === 'BUDGET_VERSION_TAKEN';
        if (lostRace && attempt < MAX_VERSION_ALLOCATION_ATTEMPTS) {
          continue;
        }
        throw error;
      }
    }
  }
}

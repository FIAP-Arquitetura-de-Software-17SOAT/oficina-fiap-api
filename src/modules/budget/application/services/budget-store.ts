import { Budget } from '../../domain/entities/budget.entity';
import { BudgetApplicationError } from '../errors/budget-application.error';
import { BudgetRepositoryPort } from '../ports/budget-repository.port';
import { ServiceOrderPort } from '../ports/service-order.port';

/**
 * O que vários casos de uso do orçamento têm em comum: carregar respeitando
 * o recorte do cliente e gravar com compare-and-set.
 *
 * `clientScope` é o cliente do CUSTOMER que pergunta. O orçamento não guarda
 * o cliente, então o recorte passa pela OS: orçamento de OS de outro cliente
 * responde 404, como se não existisse.
 */
export class BudgetStore {
  constructor(
    private readonly budgets: BudgetRepositoryPort,
    private readonly serviceOrders: ServiceOrderPort,
  ) {}

  async findVisible(id: string, clientScope?: string): Promise<Budget> {
    const budget = await this.budgets.findById(id);

    if (
      !budget ||
      !(await this.isVisibleTo(budget.getServiceOrderId(), clientScope))
    ) {
      throw new BudgetApplicationError('BUDGET_NOT_FOUND');
    }

    return budget;
  }

  async isVisibleTo(
    serviceOrderId: string,
    clientScope: string | undefined,
  ): Promise<boolean> {
    if (clientScope === undefined) return true;

    const serviceOrder = await this.serviceOrders.findById(serviceOrderId);
    return serviceOrder !== null && serviceOrder.clientId === clientScope;
  }

  async persistGenerated(
    budget: Budget,
    expectedUpdatedAt: Date,
  ): Promise<Budget> {
    const updated = await this.budgets.updateGenerated(
      budget,
      expectedUpdatedAt,
    );
    if (!updated) {
      throw new BudgetApplicationError('BUDGET_CONCURRENT_UPDATE');
    }
    return updated;
  }

  async persistWaitingApprovalDecision(
    budget: Budget,
    expectedUpdatedAt: Date,
  ): Promise<Budget> {
    const updated = await this.budgets.updateWaitingApproval(
      budget,
      expectedUpdatedAt,
    );
    if (!updated) {
      throw new BudgetApplicationError('BUDGET_CONCURRENT_UPDATE');
    }
    return updated;
  }
}

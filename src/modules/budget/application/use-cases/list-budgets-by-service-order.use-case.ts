import { Budget } from '../../domain/entities/budget.entity';
import { BudgetApplicationError } from '../errors/budget-application.error';
import { BudgetRepositoryPort } from '../ports/budget-repository.port';
import { BudgetStore } from '../services/budget-store';

export class ListBudgetsByServiceOrderUseCase {
  constructor(
    private readonly budgets: BudgetRepositoryPort,
    private readonly store: BudgetStore,
  ) {}

  async execute(
    serviceOrderId: string,
    clientScope?: string,
  ): Promise<Budget[]> {
    const normalized = serviceOrderId.trim();

    if (!(await this.store.isVisibleTo(normalized, clientScope))) {
      throw new BudgetApplicationError('SERVICE_ORDER_NOT_FOUND');
    }

    return this.budgets.findByServiceOrderId(normalized);
  }
}

import { Budget } from '../../domain/entities/budget.entity';
import { BudgetRepositoryPort } from '../ports/budget-repository.port';

export class ListBudgetsUseCase {
  constructor(private readonly budgets: BudgetRepositoryPort) {}

  execute(): Promise<Budget[]> {
    return this.budgets.findAll();
  }
}

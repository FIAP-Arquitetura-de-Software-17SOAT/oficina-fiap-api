import { Budget } from '../../domain/entities/budget.entity';
import { BudgetStore } from '../services/budget-store';

export class FindBudgetUseCase {
  constructor(private readonly store: BudgetStore) {}

  execute(id: string, clientScope?: string): Promise<Budget> {
    return this.store.findVisible(id, clientScope);
  }
}

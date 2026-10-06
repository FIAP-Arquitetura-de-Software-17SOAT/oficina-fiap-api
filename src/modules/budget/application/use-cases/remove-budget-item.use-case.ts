import { Budget } from '../../domain/entities/budget.entity';
import { BudgetStore } from '../services/budget-store';

export class RemoveBudgetItemUseCase {
  constructor(private readonly store: BudgetStore) {}

  async execute(id: string, itemId: string): Promise<Budget> {
    const budget = await this.store.findVisible(id);
    const expectedUpdatedAt = budget.getUpdatedAt();
    budget.removeItem(itemId);
    return this.store.persistGenerated(budget, expectedUpdatedAt);
  }
}

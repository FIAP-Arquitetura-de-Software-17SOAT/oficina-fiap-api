import { BudgetStore } from '../services/budget-store';

export class CalculateBudgetTotalUseCase {
  constructor(private readonly store: BudgetStore) {}

  async execute(id: string): Promise<number> {
    return (await this.store.findVisible(id)).getTotal().value;
  }
}

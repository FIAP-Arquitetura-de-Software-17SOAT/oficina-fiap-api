import { Budget } from '../../domain/entities/budget.entity';
import { CreateBudgetItemInput } from '../contracts/budget.input';
import { BudgetItemReferences } from '../services/budget-item-references';
import { BudgetStore } from '../services/budget-store';

export class AddBudgetItemUseCase {
  constructor(
    private readonly store: BudgetStore,
    private readonly references: BudgetItemReferences,
  ) {}

  async execute(id: string, input: CreateBudgetItemInput): Promise<Budget> {
    await this.references.assertExist([input]);

    const budget = await this.store.findVisible(id);
    const expectedUpdatedAt = budget.getUpdatedAt();
    budget.addItem(BudgetItemReferences.toProps(input));
    return this.store.persistGenerated(budget, expectedUpdatedAt);
  }
}

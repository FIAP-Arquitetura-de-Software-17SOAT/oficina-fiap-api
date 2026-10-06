import { Injectable } from '@nestjs/common';
import {
  BudgetItemType,
  BudgetStatus,
} from '../../../budget/entities/budget.entity';
import { BudgetService } from '../../../budget/services/budget.service';
import {
  AcceptedBudget,
  AcceptedBudgetsPort,
} from '../../application/ports/accepted-budgets.port';

/** Fala com o módulo de orçamento (ainda legado) e devolve só o que a porta pede. */
@Injectable()
export class BudgetAdapter implements AcceptedBudgetsPort {
  constructor(private readonly budgets: BudgetService) {}

  async findAccepted(serviceOrderId: string): Promise<AcceptedBudget[]> {
    const budgets = await this.budgets.findByServiceOrderId(serviceOrderId);

    return budgets
      .filter((budget) => budget.getStatus() === BudgetStatus.ACCEPTED)
      .map((budget) => ({
        id: budget.getId(),
        version: budget.getVersion(),
        partItems: budget
          .getItems()
          .filter((item) => item.getType() === BudgetItemType.PART)
          .map((item) => ({
            partId: item.getPartId(),
            description: item.getDescription(),
            quantity: item.getQuantity(),
          })),
      }));
  }
}

import { Injectable } from '@nestjs/common';
import { ListBudgetsByServiceOrderUseCase } from '../../../budget/application/use-cases/list-budgets-by-service-order.use-case';
import {
  BudgetItemType,
  BudgetStatus,
} from '../../../budget/domain/entities/budget.entity';
import {
  AcceptedBudget,
  AcceptedBudgetsPort,
} from '../../application/ports/accepted-budgets.port';

/** Fala com o módulo de orçamento e devolve só o que a porta pede. */
@Injectable()
export class BudgetAdapter implements AcceptedBudgetsPort {
  constructor(
    private readonly listBudgetsByServiceOrder: ListBudgetsByServiceOrderUseCase,
  ) {}

  async findAccepted(serviceOrderId: string): Promise<AcceptedBudget[]> {
    const budgets =
      await this.listBudgetsByServiceOrder.execute(serviceOrderId);

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

import { Injectable } from '@nestjs/common';
import { FindAcceptedBudgetUseCase } from '../../../budget/application/use-cases/find-accepted-budget.use-case';
import {
  AcceptedBudget,
  AcceptedBudgetPort,
} from '../../application/ports/accepted-budget.port';

@Injectable()
export class AcceptedBudgetAdapter implements AcceptedBudgetPort {
  constructor(private readonly findAcceptedBudget: FindAcceptedBudgetUseCase) {}

  async findAccepted(serviceOrderId: string): Promise<AcceptedBudget | null> {
    const budget = await this.findAcceptedBudget.execute(serviceOrderId);
    return budget ? { id: budget.getId(), total: budget.getTotal() } : null;
  }
}

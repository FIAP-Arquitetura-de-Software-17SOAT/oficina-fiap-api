import { Budget } from '../../domain/entities/budget.entity';
import { RefuseBudgetInput } from '../contracts/budget.input';
import { BudgetStore } from '../services/budget-store';

/**
 * Recusar orçamento **não** encerra a ordem de serviço: o cliente achar cara a
 * primeira proposta é o caso comum, e a oficina precisa poder refazer o
 * orçamento sem abrir outra OS. Desistir é decisão de quem atende, via
 * `PATCH /service-orders/:id/cancel`.
 */
export class RefuseBudgetUseCase {
  constructor(private readonly store: BudgetStore) {}

  async execute(
    id: string,
    input: RefuseBudgetInput,
    clientScope?: string,
  ): Promise<Budget> {
    const budget = await this.store.findVisible(id, clientScope);
    const expectedUpdatedAt = budget.getUpdatedAt();
    budget.refuse(input.reason);
    return this.store.persistWaitingApprovalDecision(budget, expectedUpdatedAt);
  }
}

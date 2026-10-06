import { Budget, BudgetStatus } from '../../domain/entities/budget.entity';
import { BudgetRepositoryPort } from '../ports/budget-repository.port';

/**
 * Uma OS pode ter vários orçamentos — reparos adicionais aprovados durante a
 * execução. O que vale para cobrança e despacho é o aceito de maior versão.
 * A regra mora aqui para os dois consumidores não a repetirem.
 */
export class FindAcceptedBudgetUseCase {
  constructor(private readonly budgets: BudgetRepositoryPort) {}

  async execute(serviceOrderId: string): Promise<Budget | null> {
    const budgets = await this.budgets.findByServiceOrderId(
      serviceOrderId.trim(),
    );
    return (
      budgets
        .filter((budget) => budget.getStatus() === BudgetStatus.ACCEPTED)
        .sort((a, b) => b.getVersion() - a.getVersion())[0] ?? null
    );
  }
}

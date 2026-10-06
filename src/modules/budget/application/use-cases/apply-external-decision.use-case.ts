import { Budget, BudgetStatus } from '../../domain/entities/budget.entity';
import {
  BudgetDecision,
  ExternalDecisionInput,
} from '../contracts/budget.input';
import { BudgetApplicationError } from '../errors/budget-application.error';
import { AcceptBudgetUseCase } from './accept-budget.use-case';
import { FindBudgetByApprovalTokenUseCase } from './find-budget-by-approval-token.use-case';
import { RefuseBudgetUseCase } from './refuse-budget.use-case';

/**
 * Resposta do cliente vinda de fora, pelo webhook. Sistemas que entregam
 * webhook reenviam quando não recebem 2xx, então a mesma decisão chegando de
 * novo devolve o orçamento sem repetir os efeitos (baixa de peças, emails).
 * Decisão contrária à já registrada é conflito: o cliente já respondeu.
 */
export class ApplyExternalDecisionUseCase {
  constructor(
    private readonly findByToken: FindBudgetByApprovalTokenUseCase,
    private readonly accept: AcceptBudgetUseCase,
    private readonly refuse: RefuseBudgetUseCase,
  ) {}

  async execute(input: ExternalDecisionInput): Promise<Budget> {
    const budget = await this.findByToken.execute(input.token);
    const target =
      input.decision === BudgetDecision.APPROVED
        ? BudgetStatus.ACCEPTED
        : BudgetStatus.REFUSED;
    const status = budget.getStatus();

    if (status === target) {
      return budget;
    }
    if (status === BudgetStatus.ACCEPTED || status === BudgetStatus.REFUSED) {
      throw new BudgetApplicationError('BUDGET_ALREADY_ANSWERED', {
        accepted: status === BudgetStatus.ACCEPTED,
      });
    }

    return input.decision === BudgetDecision.APPROVED
      ? this.accept.execute(budget.getId())
      : this.refuse.execute(budget.getId(), { reason: input.reason ?? '' });
  }
}

import { Budget } from '../../domain/entities/budget.entity';
import { ApprovalToken } from '../../domain/value-objects/approval-token.vo';
import { BudgetApplicationError } from '../errors/budget-application.error';
import { BudgetRepositoryPort } from '../ports/budget-repository.port';

/**
 * O orçamento que o link do email aponta. O token é a prova de que quem
 * responde recebeu o email do cliente: sem ele, conhecer o id do orçamento
 * não basta. Link desconhecido responde 404; link vencido, 410.
 */
export class FindBudgetByApprovalTokenUseCase {
  constructor(private readonly budgets: BudgetRepositoryPort) {}

  async execute(rawToken: string): Promise<Budget> {
    const token = ApprovalToken.parse(rawToken);
    const budget = token
      ? await this.budgets.findByApprovalTokenHash(token.digest())
      : null;

    if (!budget) {
      throw new BudgetApplicationError('APPROVAL_LINK_INVALID');
    }
    if (budget.isApprovalLinkExpired()) {
      throw new BudgetApplicationError('APPROVAL_LINK_EXPIRED');
    }
    return budget;
  }
}

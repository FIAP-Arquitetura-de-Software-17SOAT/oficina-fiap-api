import { BudgetItemType } from '../../domain/enums/budget-item-type.enum';

export interface CreateBudgetItemInput {
  partId?: string;
  serviceId?: string;
  description: string;
  type: BudgetItemType;
  quantity: number;
  /** Decimal como chega na API (149.90); a aplicação converte para Money. */
  unitPrice: number;
}

export interface CreateBudgetInput {
  serviceOrderId: string;
  items: CreateBudgetItemInput[];
}

export interface RefuseBudgetInput {
  reason: string;
}

export enum BudgetDecision {
  APPROVED = 'APPROVED',
  REFUSED = 'REFUSED',
}

/** Resposta do cliente vinda do link do e-mail (webhook). */
export interface ExternalDecisionInput {
  token: string;
  decision: BudgetDecision;
  reason?: string;
}

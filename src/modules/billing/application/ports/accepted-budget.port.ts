import { Money } from '../../../../shared/domain/value-objects/money.vo';

/** Regra 14: o valor da cobrança é o total do orçamento aceito. */
export interface AcceptedBudget {
  id: string;
  total: Money;
}

export abstract class AcceptedBudgetPort {
  abstract findAccepted(serviceOrderId: string): Promise<AcceptedBudget | null>;
}

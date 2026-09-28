import {
  ApplicationError,
  ApplicationErrorKind,
} from '../../../../shared/application/application.error';

export type BudgetErrorCode =
  | 'BUDGET_NOT_FOUND'
  | 'SERVICE_ORDER_NOT_FOUND'
  | 'SERVICE_NOT_FOUND'
  | 'PART_NOT_FOUND'
  | 'APPROVAL_LINK_INVALID'
  | 'APPROVAL_LINK_EXPIRED'
  | 'BUDGET_ALREADY_ANSWERED'
  | 'SERVICE_ORDER_CLOSED'
  | 'BUDGET_WAITING_APPROVAL'
  | 'BUDGET_VERSION_TAKEN'
  | 'BUDGET_VERSION_ALLOCATION'
  | 'BUDGET_CONCURRENT_UPDATE';

export interface BudgetErrorParams {
  status?: string;
  version?: number;
  accepted?: boolean;
}

const catalog: Record<
  BudgetErrorCode,
  { kind: ApplicationErrorKind; message: (p: BudgetErrorParams) => string }
> = {
  BUDGET_NOT_FOUND: {
    kind: 'NOT_FOUND',
    message: () => 'Orçamento não encontrado',
  },
  SERVICE_ORDER_NOT_FOUND: {
    kind: 'NOT_FOUND',
    message: () => 'Ordem de serviço não encontrada',
  },
  SERVICE_NOT_FOUND: {
    kind: 'NOT_FOUND',
    message: () => 'Serviço não encontrado',
  },
  PART_NOT_FOUND: { kind: 'NOT_FOUND', message: () => 'Peça não encontrada' },
  APPROVAL_LINK_INVALID: {
    kind: 'NOT_FOUND',
    message: () => 'Link de aprovação inválido',
  },
  APPROVAL_LINK_EXPIRED: {
    kind: 'GONE',
    message: () =>
      'Link de aprovação vencido; peça à oficina um novo orçamento',
  },
  BUDGET_ALREADY_ANSWERED: {
    kind: 'CONFLICT',
    message: (p) => `O orçamento já foi ${p.accepted ? 'aceito' : 'recusado'}`,
  },
  SERVICE_ORDER_CLOSED: {
    kind: 'CONFLICT',
    message: (p) =>
      `Ordem de serviço ${p.status ?? ''} não aceita novo orçamento`,
  },
  BUDGET_WAITING_APPROVAL: {
    kind: 'CONFLICT',
    message: (p) =>
      `A versão ${p.version ?? ''} do orçamento aguarda aprovação do cliente; aceite ou recuse antes de gerar outra`,
  },
  BUDGET_VERSION_TAKEN: {
    kind: 'CONFLICT',
    message: () => 'Não foi possível alocar a versão do orçamento',
  },
  BUDGET_VERSION_ALLOCATION: {
    kind: 'CONFLICT',
    message: () => 'Não foi possível alocar a versão do orçamento',
  },
  BUDGET_CONCURRENT_UPDATE: {
    kind: 'CONFLICT',
    message: () => 'O status do orçamento foi alterado por outra requisição',
  },
};

export class BudgetApplicationError extends ApplicationError {
  declare readonly code: BudgetErrorCode;

  constructor(code: BudgetErrorCode, params: BudgetErrorParams = {}) {
    super(code, catalog[code].kind, catalog[code].message(params));
  }
}

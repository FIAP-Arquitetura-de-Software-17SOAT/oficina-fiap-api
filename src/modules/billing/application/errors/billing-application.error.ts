import {
  ApplicationError,
  ApplicationErrorKind,
} from '../../../../shared/application/application.error';

export type BillingErrorCode =
  | 'BILLING_NOT_FOUND'
  | 'SERVICE_ORDER_NOT_FOUND'
  | 'SERVICE_ORDER_NOT_COMPLETED'
  | 'BILLING_ALREADY_EXISTS'
  | 'NO_ACCEPTED_BUDGET'
  | 'BILLING_PAID_IS_TERMINAL'
  | 'PAYMENT_LINK_NOT_EXPIRED'
  | 'INVALID_WEBHOOK_SIGNATURE'
  | 'CHECKOUT_SESSION_REQUIRED'
  | 'BILLING_NOT_PAID'
  | 'BILLING_CONCURRENT_UPDATE';

const catalog: Record<
  BillingErrorCode,
  { kind: ApplicationErrorKind; message: string }
> = {
  BILLING_NOT_FOUND: { kind: 'NOT_FOUND', message: 'Cobrança não encontrada' },
  SERVICE_ORDER_NOT_FOUND: {
    kind: 'NOT_FOUND',
    message: 'Service order not found',
  },
  SERVICE_ORDER_NOT_COMPLETED: {
    kind: 'CONFLICT',
    message: 'A ordem de serviço precisa estar finalizada para gerar cobrança',
  },
  BILLING_ALREADY_EXISTS: {
    kind: 'CONFLICT',
    message: 'Já existe cobrança para esta ordem de serviço',
  },
  NO_ACCEPTED_BUDGET: {
    kind: 'CONFLICT',
    message: 'É preciso um orçamento aceito para gerar a cobrança',
  },
  BILLING_PAID_IS_TERMINAL: {
    kind: 'CONFLICT',
    message: 'Cobrança paga é terminal',
  },
  PAYMENT_LINK_NOT_EXPIRED: {
    kind: 'INVALID',
    message: 'O link de pagamento da cobrança ainda não expirou',
  },
  INVALID_WEBHOOK_SIGNATURE: {
    kind: 'INVALID',
    message: 'Assinatura do webhook do Stripe inválida',
  },
  CHECKOUT_SESSION_REQUIRED: {
    kind: 'INVALID',
    message: 'O id da sessão de checkout é obrigatório',
  },
  BILLING_NOT_PAID: {
    kind: 'CONFLICT',
    message: 'A cobrança precisa estar paga para entregar a OS',
  },
  BILLING_CONCURRENT_UPDATE: {
    kind: 'CONFLICT',
    message: 'A cobrança foi alterada por outra requisição',
  },
};

export class BillingApplicationError extends ApplicationError {
  declare readonly code: BillingErrorCode;

  constructor(code: BillingErrorCode) {
    super(code, catalog[code].kind, catalog[code].message);
  }
}

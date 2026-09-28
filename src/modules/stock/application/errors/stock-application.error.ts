import {
  ApplicationError,
  ApplicationErrorKind,
} from '../../../../shared/application/application.error';

export type StockErrorCode =
  | 'PART_NOT_FOUND'
  | 'PART_CODE_IN_USE'
  | 'PART_HAS_LINKS'
  | 'MOVEMENT_QUANTITY_INVALID'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'INSUFFICIENT_STOCK'
  | 'IDEMPOTENCY_KEY_CONFLICT'
  | 'MOVEMENT_PART_NOT_FOUND';

const catalog: Record<
  StockErrorCode,
  { kind: ApplicationErrorKind; message: string }
> = {
  PART_NOT_FOUND: { kind: 'NOT_FOUND', message: 'Peça não encontrada' },
  PART_CODE_IN_USE: {
    kind: 'CONFLICT',
    message: 'Código da peça já cadastrado',
  },
  // P2003: a peça ainda é referenciada por movimentação de estoque, item de
  // orçamento ou item de pedido de compra — todas as relações são Restrict de
  // propósito, para não levar o histórico junto.
  PART_HAS_LINKS: {
    kind: 'CONFLICT',
    message:
      'Peça possui movimentações, orçamentos ou pedidos de compra vinculados e não pode ser removida',
  },
  MOVEMENT_QUANTITY_INVALID: {
    kind: 'INVALID',
    message: 'Movement quantity must be a positive integer',
  },
  IDEMPOTENCY_KEY_REQUIRED: {
    kind: 'INVALID',
    message: 'Idempotency key is required',
  },
  INSUFFICIENT_STOCK: { kind: 'CONFLICT', message: 'Insufficient stock' },
  IDEMPOTENCY_KEY_CONFLICT: {
    kind: 'CONFLICT',
    message: 'Idempotency key already in use',
  },
  // O fluxo de movimentação sempre falou inglês; mantido para não mudar a API.
  MOVEMENT_PART_NOT_FOUND: { kind: 'NOT_FOUND', message: 'Part not found' },
};

export class StockApplicationError extends ApplicationError {
  declare readonly code: StockErrorCode;

  constructor(code: StockErrorCode) {
    super(code, catalog[code].kind, catalog[code].message);
  }
}

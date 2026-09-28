import {
  ApplicationError,
  ApplicationErrorKind,
} from '../../../../shared/application/application.error';

export type PurchaseOrderErrorCode =
  | 'PURCHASE_ORDER_NOT_FOUND'
  | 'PART_NOT_FOUND'
  | 'PURCHASE_ORDER_NUMBER_IN_USE';

const catalog: Record<
  PurchaseOrderErrorCode,
  { kind: ApplicationErrorKind; message: string }
> = {
  PURCHASE_ORDER_NOT_FOUND: {
    kind: 'NOT_FOUND',
    message: 'Pedido de compra não encontrado',
  },
  PART_NOT_FOUND: { kind: 'NOT_FOUND', message: 'Peça não encontrada' },
  PURCHASE_ORDER_NUMBER_IN_USE: {
    kind: 'CONFLICT',
    message: 'Purchase order number already exists',
  },
};

export class PurchaseOrderApplicationError extends ApplicationError {
  declare readonly code: PurchaseOrderErrorCode;

  constructor(code: PurchaseOrderErrorCode) {
    super(code, catalog[code].kind, catalog[code].message);
  }
}

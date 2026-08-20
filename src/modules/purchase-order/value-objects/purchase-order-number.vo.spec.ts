import {
  PurchaseOrderNumber,
} from './purchase-order-number.vo';

describe('PurchaseOrderNumber', () => {
  it('should create a valid purchase order number', () => {
    const number =
      PurchaseOrderNumber.create(
        'PC-2026-0042',
      );

    expect(number.value).toBe(
      'PC-2026-0042',
    );
  });

  it('should normalize lowercase value', () => {
    const number =
      PurchaseOrderNumber.create(
        'pc-2026-0042',
      );

    expect(number.value).toBe(
      'PC-2026-0042',
    );
  });

  it('should trim whitespace', () => {
    const number =
      PurchaseOrderNumber.create(
        '  PC-2026-0042  ',
      );

    expect(number.value).toBe(
      'PC-2026-0042',
    );
  });

  it('should reject an empty number', () => {
    expect(() =>
      PurchaseOrderNumber.create(''),
    ).toThrow(
      'O número do pedido deve ser informado',
    );
  });

  it('should reject invalid format', () => {
    expect(() =>
      PurchaseOrderNumber.create(
        'ORDER-42',
      ),
    ).toThrow(
      'Número do pedido deve seguir o formato PC-AAAA-NNNN',
    );
  });

  it('should reject number without sequence', () => {
    expect(() =>
      PurchaseOrderNumber.create(
        'PC-2026',
      ),
    ).toThrow();
  });

  it('should compare equal numbers', () => {
    const first =
      PurchaseOrderNumber.create(
        'PC-2026-0042',
      );

    const second =
      PurchaseOrderNumber.create(
        'PC-2026-0042',
      );

    expect(first.equals(second)).toBe(
      true,
    );
  });
});
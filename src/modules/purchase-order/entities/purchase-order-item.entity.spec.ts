import { PurchaseOrderItem } from './purchase-order-item.entity';

import { Money } from '../../../shared/domain/value-objects/money.vo';

import { Quantity } from '../value-objects/quantity.vo';

describe('PurchaseOrderItem', () => {
  it('should create a purchase order item', () => {
    const item = new PurchaseOrderItem({
      partId: '550e8400-e29b-41d4-a716-446655440000',

      quantity: Quantity.create(2),

      unitPrice: Money.fromDecimal(150.5),
    });

    expect(item.getId()).toBeDefined();

    expect(item.getPecaId()).toBe('550e8400-e29b-41d4-a716-446655440000');

    expect(item.getQuantity().value).toBe(2);

    expect(item.getUnitPrice().value).toBe(150.5);
  });

  it('should calculate subtotal', () => {
    const item = new PurchaseOrderItem({
      partId: '550e8400-e29b-41d4-a716-446655440000',

      quantity: Quantity.create(2),

      unitPrice: Money.fromDecimal(150.5),
    });

    expect(item.getSubtotal().value).toBe(301);

    expect(item.getSubtotal().valueInCents).toBe(30100);
  });

  it('should use provided id when rebuilding entity', () => {
    const item = new PurchaseOrderItem({
      id: 'item-123',

      partId: '550e8400-e29b-41d4-a716-446655440000',

      quantity: Quantity.create(1),

      unitPrice: Money.fromDecimal(100),
    });

    expect(item.getId()).toBe('item-123');
  });

  it('should reject item without partId', () => {
    expect(
      () =>
        new PurchaseOrderItem({
          partId: '',

          quantity: Quantity.create(1),

          unitPrice: Money.fromDecimal(100),
        }),
    ).toThrow('A peça deve ser informada');
  });
});

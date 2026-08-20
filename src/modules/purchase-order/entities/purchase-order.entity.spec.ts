import {
  PurchaseOrder,
} from './purchase-order.entity';

import {
  PurchaseOrderItem,
} from './purchase-order-item.entity';

import {
  PurchaseOrderStatus,
} from '../enums/purchase-order-status.enum';

import {
  Money,
} from '../value-objects/money.vo';

import {
  PurchaseOrderNumber,
} from '../value-objects/purchase-order-number.vo';

import {
  Quantity,
} from '../value-objects/quantity.vo';

describe('PurchaseOrder', () => {
  const createOrder =
    (): PurchaseOrder => {
      return new PurchaseOrder({
        number:
          PurchaseOrderNumber.create(
            'PC-2026-0042',
          ),

        supplier:
          'Auto Peças São Paulo',
      });
    };

  const createItem = (
    id?: string,
  ): PurchaseOrderItem => {
    return new PurchaseOrderItem({
      id,

      pecaId:
        '550e8400-e29b-41d4-a716-446655440000',

      quantity:
        Quantity.create(2),

      unitPrice:
        Money.fromDecimal(150.5),
    });
  };

  it('should create purchase order in NECESSITA_COMPRA status', () => {
    const order = createOrder();

    expect(order.getId()).toBeDefined();

    expect(order.getStatus()).toBe(
      PurchaseOrderStatus.NECESSITA_COMPRA,
    );

    expect(order.getItems()).toHaveLength(
      0,
    );

    expect(
      order.getDeliveredAt(),
    ).toBeUndefined();
  });

  it('should add an item', () => {
    const order = createOrder();

    order.addItem(createItem());

    expect(order.getItems()).toHaveLength(
      1,
    );
  });

  it('should remove an item', () => {
    const order = createOrder();

    const item =
      createItem('item-123');

    order.addItem(item);

    order.removeItem('item-123');

    expect(order.getItems()).toHaveLength(
      0,
    );
  });

  it('should throw when removing an unknown item', () => {
    const order = createOrder();

    expect(() =>
      order.removeItem('unknown-item'),
    ).toThrow(
      'Item não encontrado no pedido',
    );
  });

  it('should calculate purchase order total', () => {
    const order = createOrder();

    order.addItem(
      new PurchaseOrderItem({
        pecaId: 'peca-1',

        quantity:
          Quantity.create(2),

        unitPrice:
          Money.fromDecimal(100),
      }),
    );

    order.addItem(
      new PurchaseOrderItem({
        pecaId: 'peca-2',

        quantity:
          Quantity.create(4),

        unitPrice:
          Money.fromDecimal(25),
      }),
    );

    expect(
      order.getTotal().value,
    ).toBe(300);
  });

  it('should not register purchase without items', () => {
    const order = createOrder();

    expect(() =>
      order.registerPurchase(),
    ).toThrow(
      'Não é possível registrar uma compra sem itens',
    );

    expect(order.getStatus()).toBe(
      PurchaseOrderStatus.NECESSITA_COMPRA,
    );
  });

  it('should change from NECESSITA_COMPRA to AGUARDANDO_ENTREGA', () => {
    const order = createOrder();

    order.addItem(createItem());

    order.registerPurchase();

    expect(order.getStatus()).toBe(
      PurchaseOrderStatus.AGUARDANDO_ENTREGA,
    );
  });

  it('should not register purchase twice', () => {
    const order = createOrder();

    order.addItem(createItem());

    order.registerPurchase();

    expect(() =>
      order.registerPurchase(),
    ).toThrow(
      'Somente pedidos em NECESSITA_COMPRA podem registrar a compra',
    );
  });

  it('should not add items after purchase registration', () => {
    const order = createOrder();

    order.addItem(createItem());

    order.registerPurchase();

    expect(() =>
      order.addItem(createItem()),
    ).toThrow(
      'Não é possível alterar os itens após o registro da compra',
    );
  });

  it('should not remove items after purchase registration', () => {
    const order = createOrder();

    const item =
      createItem('item-123');

    order.addItem(item);

    order.registerPurchase();

    expect(() =>
      order.removeItem('item-123'),
    ).toThrow(
      'Não é possível alterar os itens após o registro da compra',
    );
  });

  it('should mark awaiting order as delivered', () => {
    const order = createOrder();

    order.addItem(createItem());

    order.registerPurchase();

    order.markAsDelivered();

    expect(order.getStatus()).toBe(
      PurchaseOrderStatus.ENTREGUE,
    );

    expect(
      order.getDeliveredAt(),
    ).toBeInstanceOf(Date);
  });

  it('should not deliver order before purchase registration', () => {
    const order = createOrder();

    order.addItem(createItem());

    expect(() =>
      order.markAsDelivered(),
    ).toThrow(
      'Somente pedidos aguardando entrega podem ser marcados como entregues',
    );
  });

  it('should treat ENTREGUE as terminal status', () => {
    const order = createOrder();

    order.addItem(createItem());

    order.registerPurchase();

    order.markAsDelivered();

    expect(() =>
      order.markAsDelivered(),
    ).toThrow();

    expect(() =>
      order.registerPurchase(),
    ).toThrow();

    expect(() =>
      order.addItem(createItem()),
    ).toThrow();

    expect(order.getStatus()).toBe(
      PurchaseOrderStatus.ENTREGUE,
    );
  });
});
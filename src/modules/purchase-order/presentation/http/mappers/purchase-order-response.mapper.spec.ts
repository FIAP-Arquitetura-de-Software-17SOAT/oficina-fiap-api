import { Money } from '../../../../../shared/domain/value-objects/money.vo';
import { Quantity } from '../../../../../shared/domain/value-objects/quantity.vo';
import { PurchaseOrderItem } from '../../../domain/entities/purchase-order-item.entity';
import { PurchaseOrder } from '../../../domain/entities/purchase-order.entity';
import { PurchaseOrderNumber } from '../../../domain/value-objects/purchase-order-number.vo';
import { PurchaseOrderResponseMapper } from './purchase-order-response.mapper';

const makeOrder = () => {
  const order = new PurchaseOrder({
    id: 'purchase-order-id',
    number: PurchaseOrderNumber.create('PC-2026-0042'),
    supplier: 'Auto Peças São Paulo',
  });
  order.addItem(
    new PurchaseOrderItem({
      id: 'item-1',
      partId: 'part-1',
      quantity: Quantity.positive(2),
      unitPrice: Money.fromDecimal(150.5),
    }),
  );
  return order;
};

describe('PurchaseOrderResponseMapper', () => {
  it('flattens the aggregate with derived totals and resolved part names', () => {
    const response = PurchaseOrderResponseMapper.toResponse(
      makeOrder(),
      new Map([['part-1', 'Filtro de óleo']]),
    );

    expect(response).toMatchObject({
      id: 'purchase-order-id',
      number: 'PC-2026-0042',
      supplier: 'Auto Peças São Paulo',
      status: 'NEEDS_PURCHASE',
      total: 301,
      deliveredAt: null,
      items: [
        {
          id: 'item-1',
          partId: 'part-1',
          partName: 'Filtro de óleo',
          quantity: 2,
          unitPrice: 150.5,
          subtotal: 301,
        },
      ],
    });
  });

  it('leaves partName null when the part was not resolved', () => {
    const [response] = PurchaseOrderResponseMapper.toResponseList([
      makeOrder(),
    ]);

    expect(response.items[0].partName).toBeNull();
  });
});

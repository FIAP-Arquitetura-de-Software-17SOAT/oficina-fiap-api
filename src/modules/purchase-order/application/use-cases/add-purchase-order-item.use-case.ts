import { Money } from '../../../../shared/domain/value-objects/money.vo';
import { Quantity } from '../../../../shared/domain/value-objects/quantity.vo';
import { PurchaseOrderItem } from '../../domain/entities/purchase-order-item.entity';
import { PurchaseOrder } from '../../domain/entities/purchase-order.entity';
import { AddPurchaseOrderItemInput } from '../contracts/purchase-order.input';
import { PurchaseOrderRepositoryPort } from '../ports/purchase-order-repository.port';
import { FindPurchaseOrderUseCase } from './find-purchase-order.use-case';

export class AddPurchaseOrderItemUseCase {
  constructor(private readonly purchaseOrders: PurchaseOrderRepositoryPort) {}

  async execute(
    id: string,
    input: AddPurchaseOrderItemInput,
  ): Promise<PurchaseOrder> {
    const purchaseOrder = await new FindPurchaseOrderUseCase(
      this.purchaseOrders,
    ).execute(id);

    purchaseOrder.addItem(
      new PurchaseOrderItem({
        partId: input.partId,
        quantity: Quantity.positive(input.quantity),
        unitPrice: Money.fromDecimal(input.unitPrice),
      }),
    );

    return this.purchaseOrders.update(purchaseOrder);
  }
}

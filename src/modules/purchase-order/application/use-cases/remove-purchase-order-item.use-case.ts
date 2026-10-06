import { PurchaseOrder } from '../../domain/entities/purchase-order.entity';
import { PurchaseOrderRepositoryPort } from '../ports/purchase-order-repository.port';
import { FindPurchaseOrderUseCase } from './find-purchase-order.use-case';

export class RemovePurchaseOrderItemUseCase {
  constructor(private readonly purchaseOrders: PurchaseOrderRepositoryPort) {}

  async execute(id: string, itemId: string): Promise<PurchaseOrder> {
    const purchaseOrder = await new FindPurchaseOrderUseCase(
      this.purchaseOrders,
    ).execute(id);

    purchaseOrder.removeItem(itemId);

    return this.purchaseOrders.update(purchaseOrder);
  }
}

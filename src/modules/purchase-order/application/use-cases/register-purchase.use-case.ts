import { PurchaseOrder } from '../../domain/entities/purchase-order.entity';
import { PurchaseOrderRepositoryPort } from '../ports/purchase-order-repository.port';
import { FindPurchaseOrderUseCase } from './find-purchase-order.use-case';

export class RegisterPurchaseUseCase {
  constructor(private readonly purchaseOrders: PurchaseOrderRepositoryPort) {}

  async execute(id: string): Promise<PurchaseOrder> {
    const purchaseOrder = await new FindPurchaseOrderUseCase(
      this.purchaseOrders,
    ).execute(id);

    purchaseOrder.registerPurchase();

    return this.purchaseOrders.update(purchaseOrder);
  }
}

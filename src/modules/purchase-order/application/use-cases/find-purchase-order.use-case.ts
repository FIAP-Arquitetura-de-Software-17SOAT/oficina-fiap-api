import { PurchaseOrder } from '../../domain/entities/purchase-order.entity';
import { PurchaseOrderApplicationError } from '../errors/purchase-order-application.error';
import { PurchaseOrderRepositoryPort } from '../ports/purchase-order-repository.port';

export class FindPurchaseOrderUseCase {
  constructor(private readonly purchaseOrders: PurchaseOrderRepositoryPort) {}

  async execute(id: string): Promise<PurchaseOrder> {
    const purchaseOrder = await this.purchaseOrders.findById(id);
    if (!purchaseOrder) {
      throw new PurchaseOrderApplicationError('PURCHASE_ORDER_NOT_FOUND');
    }
    return purchaseOrder;
  }
}

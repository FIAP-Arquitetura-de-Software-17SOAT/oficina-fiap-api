import { PurchaseOrder } from '../../domain/entities/purchase-order.entity';
import { PurchaseOrderRepositoryPort } from '../ports/purchase-order-repository.port';

export class ListPurchaseOrdersUseCase {
  constructor(private readonly purchaseOrders: PurchaseOrderRepositoryPort) {}

  execute(): Promise<PurchaseOrder[]> {
    return this.purchaseOrders.findAll();
  }
}

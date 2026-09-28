import { PurchaseOrder } from '../src/modules/purchase-order/domain/entities/purchase-order.entity';
import { PurchaseOrderRepositoryPort } from '../src/modules/purchase-order/application/ports/purchase-order-repository.port';

export class InMemoryPurchaseOrderRepository implements PurchaseOrderRepositoryPort {
  private readonly orders = new Map<string, PurchaseOrder>();

  create(purchaseOrder: PurchaseOrder): Promise<PurchaseOrder> {
    this.orders.set(purchaseOrder.getId(), purchaseOrder);
    return Promise.resolve(purchaseOrder);
  }

  update(purchaseOrder: PurchaseOrder): Promise<PurchaseOrder> {
    this.orders.set(purchaseOrder.getId(), purchaseOrder);
    return Promise.resolve(purchaseOrder);
  }

  findById(id: string): Promise<PurchaseOrder | null> {
    return Promise.resolve(this.orders.get(id) ?? null);
  }

  findAll(): Promise<PurchaseOrder[]> {
    return Promise.resolve(Array.from(this.orders.values()));
  }

  countByYear(year: number): Promise<number> {
    return Promise.resolve(
      Array.from(this.orders.values()).filter((order) =>
        order.getNumber().value.startsWith(`PC-${year}-`),
      ).length,
    );
  }
}

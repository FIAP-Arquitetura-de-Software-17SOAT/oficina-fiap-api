import { PurchaseOrder } from '../../domain/entities/purchase-order.entity';
import { PurchaseOrderNumber } from '../../domain/value-objects/purchase-order-number.vo';
import { CreatePurchaseOrderInput } from '../contracts/purchase-order.input';
import { PurchaseOrderRepositoryPort } from '../ports/purchase-order-repository.port';

export class CreatePurchaseOrderUseCase {
  constructor(private readonly purchaseOrders: PurchaseOrderRepositoryPort) {}

  execute(input: CreatePurchaseOrderInput): Promise<PurchaseOrder> {
    return this.purchaseOrders.create(
      new PurchaseOrder({
        number: PurchaseOrderNumber.create(input.number),
        supplier: input.supplier,
      }),
    );
  }
}

import { PurchaseOrder } from '../../domain/entities/purchase-order.entity';

/** A implementação traduz número repetido em `PURCHASE_ORDER_NUMBER_IN_USE`. */
export abstract class PurchaseOrderRepositoryPort {
  abstract create(purchaseOrder: PurchaseOrder): Promise<PurchaseOrder>;
  /** Base do sequencial `PC-AAAA-NNNN` dos pedidos abertos pela falta. */
  abstract countByYear(year: number): Promise<number>;
  abstract findAll(): Promise<PurchaseOrder[]>;
  abstract findById(id: string): Promise<PurchaseOrder | null>;
  abstract update(purchaseOrder: PurchaseOrder): Promise<PurchaseOrder>;
}

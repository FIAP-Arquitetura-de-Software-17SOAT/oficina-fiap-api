import { Money } from '../../../../shared/domain/value-objects/money.vo';
import { Quantity } from '../../../../shared/domain/value-objects/quantity.vo';
import { PurchaseOrderItem } from '../../domain/entities/purchase-order-item.entity';
import { PurchaseOrder } from '../../domain/entities/purchase-order.entity';
import { PurchaseOrderStatus } from '../../domain/enums/purchase-order-status.enum';
import { PurchaseOrderNumber } from '../../domain/value-objects/purchase-order-number.vo';

export interface PurchaseOrderItemRow {
  id: string;
  purchaseOrderId: string;
  partId: string;
  quantity: number;
  unitPriceCents: number;
}

export interface PurchaseOrderRow {
  id: string;
  number: string;
  supplier: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deliveredAt: Date | null;
  items: PurchaseOrderItemRow[];
}

export class PurchaseOrderPersistenceMapper {
  static itemsToPersistence(purchaseOrder: PurchaseOrder) {
    return purchaseOrder.getItems().map((item) => ({
      id: item.getId(),
      partId: item.getPartId(),
      quantity: item.getQuantity().getValue(),
      unitPriceCents: item.getUnitPrice().valueInCents,
    }));
  }

  static toCreate(purchaseOrder: PurchaseOrder) {
    return {
      id: purchaseOrder.getId(),
      number: purchaseOrder.getNumber().value,
      supplier: purchaseOrder.getSupplier(),
      status: purchaseOrder.getStatus(),
      createdAt: purchaseOrder.getCreatedAt(),
      updatedAt: purchaseOrder.getUpdatedAt(),
      deliveredAt: purchaseOrder.getDeliveredAt(),
      // Pedidos abertos pela política de necessidade de compra já nascem com
      // itens; os criados pela API nascem vazios e o map fica sem elementos.
      items: {
        create:
          PurchaseOrderPersistenceMapper.itemsToPersistence(purchaseOrder),
      },
    };
  }

  static toUpdate(purchaseOrder: PurchaseOrder) {
    return {
      status: purchaseOrder.getStatus(),
      updatedAt: purchaseOrder.getUpdatedAt(),
      deliveredAt: purchaseOrder.getDeliveredAt(),
      items: {
        deleteMany: {},
        create:
          PurchaseOrderPersistenceMapper.itemsToPersistence(purchaseOrder),
      },
    };
  }

  static toDomain(row: PurchaseOrderRow): PurchaseOrder {
    return new PurchaseOrder({
      id: row.id,
      number: PurchaseOrderNumber.create(row.number),
      supplier: row.supplier,
      status: row.status as PurchaseOrderStatus,
      items: row.items.map(
        (item) =>
          new PurchaseOrderItem({
            id: item.id,
            partId: item.partId,
            quantity: Quantity.positive(item.quantity),
            unitPrice: Money.fromCents(item.unitPriceCents),
          }),
      ),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deliveredAt: row.deliveredAt ?? undefined,
    });
  }
}

import {
  PurchaseOrder,
} from '../entities/purchase-order.entity';

export class PurchaseOrderMapper {
  static toResponse(
    purchaseOrder: PurchaseOrder,
  ) {
    return {
      id:
        purchaseOrder.getId(),

      number:
        purchaseOrder
          .getNumber()
          .value,

      supplier:
        purchaseOrder
          .getSupplier(),

      status:
        purchaseOrder
          .getStatus(),

      items:
        purchaseOrder
          .getItems()
          .map((item) => ({
            id:
              item.getId(),

            pecaId:
              item.getPecaId(),

            quantity:
              item
                .getQuantity()
                .value,

            unitPrice:
              item
                .getUnitPrice()
                .value,

            subtotal:
              item
                .getSubtotal()
                .value,
          })),

      total:
        purchaseOrder
          .getTotal()
          .value,

      createdAt:
        purchaseOrder
          .getCreatedAt(),

      updatedAt:
        purchaseOrder
          .getUpdatedAt(),

      deliveredAt:
        purchaseOrder
          .getDeliveredAt() ??
        null,
    };
  }
}
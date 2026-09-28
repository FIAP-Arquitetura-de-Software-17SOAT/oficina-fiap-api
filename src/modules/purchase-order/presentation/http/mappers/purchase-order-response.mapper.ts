import { PurchaseOrder } from '../../../domain/entities/purchase-order.entity';

export class PurchaseOrderResponseMapper {
  static toResponseList(
    purchaseOrders: PurchaseOrder[],
    partNames: Map<string, string | null> = new Map(),
  ) {
    return purchaseOrders.map((purchaseOrder) =>
      PurchaseOrderResponseMapper.toResponse(purchaseOrder, partNames),
    );
  }

  /**
   * `partNames` chega resolvido pela query de nomes porque a peça mora em outro módulo.
   * Ausente, o item sai só com o `partId` — é o que acontece quando a peça foi
   * removida do cadastro depois que o pedido foi emitido.
   */
  static toResponse(
    purchaseOrder: PurchaseOrder,
    partNames: Map<string, string | null> = new Map(),
  ) {
    return {
      id: purchaseOrder.getId(),

      number: purchaseOrder.getNumber().value,

      supplier: purchaseOrder.getSupplier(),

      status: purchaseOrder.getStatus(),

      items: purchaseOrder.getItems().map((item) => ({
        id: item.getId(),

        partId: item.getPartId(),

        partName: partNames.get(item.getPartId()) ?? null,

        quantity: item.getQuantity().getValue(),

        unitPrice: item.getUnitPrice().value,

        subtotal: item.getSubtotal().value,
      })),

      total: purchaseOrder.getTotal().value,

      createdAt: purchaseOrder.getCreatedAt(),

      updatedAt: purchaseOrder.getUpdatedAt(),

      deliveredAt: purchaseOrder.getDeliveredAt() ?? null,
    };
  }
}

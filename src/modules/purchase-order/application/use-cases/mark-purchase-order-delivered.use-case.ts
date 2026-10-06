import { PurchaseOrder } from '../../domain/entities/purchase-order.entity';
import { PurchaseOrderRepositoryPort } from '../ports/purchase-order-repository.port';
import { StockReceiptPort } from '../ports/stock-receipt.port';
import { FindPurchaseOrderUseCase } from './find-purchase-order.use-case';

export class MarkPurchaseOrderDeliveredUseCase {
  constructor(
    private readonly purchaseOrders: PurchaseOrderRepositoryPort,
    private readonly stock: StockReceiptPort,
  ) {}

  async execute(id: string): Promise<PurchaseOrder> {
    const purchaseOrder = await new FindPurchaseOrderUseCase(
      this.purchaseOrders,
    ).execute(id);

    purchaseOrder.markAsDelivered();

    const delivered = await this.purchaseOrders.update(purchaseOrder);

    // Política do Event Storming: "Quando o status do pedido for atualizado para
    // entregue, o estoque será atualizado somando a quantidade de peças
    // recebidas". A chave de idempotência deriva do pedido e do item, então
    // reentregar o mesmo pedido não soma duas vezes.
    for (const item of delivered.getItems()) {
      await this.stock.increase(
        item.getPartId(),
        item.getQuantity().getValue(),
        `purchase-order:${delivered.getId()}:${item.getId()}`,
      );
    }

    return delivered;
  }
}

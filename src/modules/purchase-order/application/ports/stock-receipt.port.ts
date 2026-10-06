/** Entrada de peças no estoque quando o pedido é entregue. */
export abstract class StockReceiptPort {
  abstract increase(
    partId: string,
    quantity: number,
    idempotencyKey: string,
  ): Promise<void>;
}

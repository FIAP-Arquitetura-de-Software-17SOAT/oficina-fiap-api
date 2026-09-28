export interface StockPart {
  id: string;
  name: string;
  quantity: number;
}

export abstract class StockPort {
  abstract findPart(partId: string): Promise<StockPart | null>;
  /**
   * Baixa `quantity` da peça. A chave de idempotência garante que repetir o
   * despacho da mesma OS não baixa o estoque duas vezes.
   */
  abstract decrease(
    partId: string,
    quantity: number,
    idempotencyKey: string,
  ): Promise<void>;
}

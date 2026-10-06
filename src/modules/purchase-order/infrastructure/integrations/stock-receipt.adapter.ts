import { Injectable } from '@nestjs/common';
import { IncreaseStockUseCase } from '../../../stock/application/use-cases/increase-stock.use-case';
import { StockReceiptPort } from '../../application/ports/stock-receipt.port';

@Injectable()
export class StockReceiptAdapter implements StockReceiptPort {
  constructor(private readonly increaseStock: IncreaseStockUseCase) {}

  async increase(
    partId: string,
    quantity: number,
    idempotencyKey: string,
  ): Promise<void> {
    await this.increaseStock.execute(partId, { quantity, idempotencyKey });
  }
}

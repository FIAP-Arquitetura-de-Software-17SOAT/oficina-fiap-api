import { Injectable } from '@nestjs/common';
import { StockApplicationError } from '../../../stock/application/errors/stock-application.error';
import { DecreaseStockUseCase } from '../../../stock/application/use-cases/decrease-stock.use-case';
import { FindPartUseCase } from '../../../stock/application/use-cases/find-part.use-case';
import { StockPart, StockPort } from '../../application/ports/stock.port';

/**
 * Fala com o módulo de estoque pelos casos de uso exportados. Peça inexistente
 * vira `null`; qualquer outro erro (estoque insuficiente numa corrida, chave
 * repetida) sobe intacto e o filtro HTTP decide o status.
 */
@Injectable()
export class StockAdapter implements StockPort {
  constructor(
    private readonly findPartUseCase: FindPartUseCase,
    private readonly decreaseStock: DecreaseStockUseCase,
  ) {}

  async findPart(partId: string): Promise<StockPart | null> {
    try {
      const part = await this.findPartUseCase.execute(partId);
      return {
        id: part.getId(),
        name: part.getName(),
        quantity: part.getQuantity().getValue(),
      };
    } catch (error) {
      if (
        error instanceof StockApplicationError &&
        error.code === 'PART_NOT_FOUND'
      ) {
        return null;
      }
      throw error;
    }
  }

  async decrease(
    partId: string,
    quantity: number,
    idempotencyKey: string,
  ): Promise<void> {
    await this.decreaseStock.execute(partId, { quantity, idempotencyKey });
  }
}

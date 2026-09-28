import { Injectable, NotFoundException } from '@nestjs/common';
import { PartService } from '../../../stock/services/part.service';
import { StockMovementService } from '../../../stock/services/stock-movement.service';
import { StockPart, StockPort } from '../../application/ports/stock.port';

/**
 * Fala com o módulo de estoque (ainda legado). Peça inexistente vira `null`;
 * qualquer outro erro (estoque insuficiente numa corrida, chave repetida)
 * sobe intacto e o filtro HTTP decide o status.
 */
@Injectable()
export class StockAdapter implements StockPort {
  constructor(
    private readonly parts: PartService,
    private readonly movements: StockMovementService,
  ) {}

  async findPart(partId: string): Promise<StockPart | null> {
    try {
      const part = await this.parts.findById(partId);
      return {
        id: part.getId(),
        name: part.getName(),
        quantity: part.getQuantity().getValue(),
      };
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }

  async decrease(
    partId: string,
    quantity: number,
    idempotencyKey: string,
  ): Promise<void> {
    await this.movements.decrease(partId, { quantity, idempotencyKey });
  }
}

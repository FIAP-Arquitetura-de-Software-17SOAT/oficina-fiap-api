import { Injectable } from '@nestjs/common';
import { StockApplicationError } from '../../../stock/application/errors/stock-application.error';
import { FindPartUseCase } from '../../../stock/application/use-cases/find-part.use-case';
import {
  CatalogPart,
  PartCatalogPort,
} from '../../application/ports/part-catalog.port';

/** Projeta a peça do estoque no que o pedido precisa; peça inexistente vira `null`. */
@Injectable()
export class PartCatalogAdapter implements PartCatalogPort {
  constructor(private readonly findPart: FindPartUseCase) {}

  async findById(partId: string): Promise<CatalogPart | null> {
    try {
      const part = await this.findPart.execute(partId);
      return {
        id: part.getId(),
        name: part.getName(),
        unitPrice: part.getUnitPrice(),
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
}

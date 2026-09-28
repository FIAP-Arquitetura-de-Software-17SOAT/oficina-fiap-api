import { Injectable } from '@nestjs/common';
import { StockApplicationError } from '../../../stock/application/errors/stock-application.error';
import { FindPartUseCase } from '../../../stock/application/use-cases/find-part.use-case';
import { PartCatalogPort } from '../../application/ports/part-catalog.port';

@Injectable()
export class PartCatalogAdapter implements PartCatalogPort {
  constructor(private readonly findPart: FindPartUseCase) {}

  async exists(partId: string): Promise<boolean> {
    try {
      await this.findPart.execute(partId);
      return true;
    } catch (error) {
      if (
        error instanceof StockApplicationError &&
        error.code === 'PART_NOT_FOUND'
      ) {
        return false;
      }
      throw error;
    }
  }
}

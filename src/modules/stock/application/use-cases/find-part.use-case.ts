import { Part } from '../../domain/entities/part.entity';
import { StockApplicationError } from '../errors/stock-application.error';
import { PartRepositoryPort } from '../ports/part-repository.port';

export class FindPartUseCase {
  constructor(private readonly parts: PartRepositoryPort) {}

  async execute(id: string): Promise<Part> {
    const part = await this.parts.findById(id);
    if (!part) throw new StockApplicationError('PART_NOT_FOUND');
    return part;
  }
}

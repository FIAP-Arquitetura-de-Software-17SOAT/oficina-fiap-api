import { Part } from '../../domain/entities/part.entity';
import { PartRepositoryPort } from '../ports/part-repository.port';

export class ListPartsUseCase {
  constructor(private readonly parts: PartRepositoryPort) {}

  execute(): Promise<Part[]> {
    return this.parts.findAll();
  }
}

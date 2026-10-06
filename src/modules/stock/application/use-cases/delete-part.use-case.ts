import { PartRepositoryPort } from '../ports/part-repository.port';
import { FindPartUseCase } from './find-part.use-case';

export class DeletePartUseCase {
  constructor(private readonly parts: PartRepositoryPort) {}

  async execute(id: string): Promise<void> {
    await new FindPartUseCase(this.parts).execute(id);
    await this.parts.delete(id);
  }
}

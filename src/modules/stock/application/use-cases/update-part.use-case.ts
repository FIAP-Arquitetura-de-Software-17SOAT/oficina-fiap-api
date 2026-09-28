import { Part } from '../../domain/entities/part.entity';
import { PartCode } from '../../domain/value-objects/part-code.vo';
import { UpdatePartInput } from '../contracts/part.input';
import { StockApplicationError } from '../errors/stock-application.error';
import { PartRepositoryPort } from '../ports/part-repository.port';
import { FindPartUseCase } from './find-part.use-case';

export class UpdatePartUseCase {
  constructor(private readonly parts: PartRepositoryPort) {}

  async execute(id: string, input: UpdatePartInput): Promise<Part> {
    const part = await new FindPartUseCase(this.parts).execute(id);

    if (input.code !== undefined) {
      const code = PartCode.create(input.code);
      const existing = await this.parts.findByCode(code.getValue());
      if (existing && existing.getId() !== id) {
        throw new StockApplicationError('PART_CODE_IN_USE');
      }
      input = { ...input, code: code.getValue() };
    }

    part.update(input);

    return this.parts.update(part);
  }
}

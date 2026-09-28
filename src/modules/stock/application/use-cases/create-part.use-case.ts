import { Part } from '../../domain/entities/part.entity';
import { CreatePartInput } from '../contracts/part.input';
import { StockApplicationError } from '../errors/stock-application.error';
import { PartRepositoryPort } from '../ports/part-repository.port';

export class CreatePartUseCase {
  constructor(private readonly parts: PartRepositoryPort) {}

  async execute(input: CreatePartInput): Promise<Part> {
    // Peça nasce com saldo zero: estoque só muda por movimentação.
    const part = Part.create({ ...input, quantity: 0 });

    // A pré-checagem existe pela mensagem; a corrida é resolvida pelo banco e
    // traduzida pelo repositório.
    if (await this.parts.findByCode(part.getCode().getValue())) {
      throw new StockApplicationError('PART_CODE_IN_USE');
    }

    return this.parts.create(part);
  }
}

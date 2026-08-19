import { DomainException } from '../../../shared/domain/domain.exception';

const ANO_MINIMO = 1900;

/**
 * Ano do veículo. O limite superior é o ano seguinte ao atual porque a
 * indústria lança o modelo do ano que vem ainda no ano corrente.
 */
export class ModelYear {
  private constructor(private readonly value: number) {}

  static create(input: number): ModelYear {
    if (!Number.isInteger(input)) {
      throw new DomainException('Ano do veículo deve ser um número inteiro');
    }

    const anoMaximo = new Date().getFullYear() + 1;

    if (input < ANO_MINIMO || input > anoMaximo) {
      throw new DomainException(
        `Ano do veículo deve estar entre ${ANO_MINIMO} e ${anoMaximo}`,
      );
    }

    return new ModelYear(input);
  }

  getValue(): number {
    return this.value;
  }

  equals(other: ModelYear): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return String(this.value);
  }
}

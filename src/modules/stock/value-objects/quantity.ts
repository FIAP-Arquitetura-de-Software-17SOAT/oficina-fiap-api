import { DomainException } from '../../../shared/domain/domain.exception';

export class Quantity {
  private constructor(private readonly value: number) {}

  static create(input: number): Quantity {
    if (!Number.isSafeInteger(input) || input < 0) {
      throw new DomainException(
        'Quantidade deve ser um número inteiro não negativo',
      );
    }

    return new Quantity(input);
  }

  getValue(): number {
    return this.value;
  }

  equals(other: Quantity): boolean {
    return this.value === other.value;
  }
}

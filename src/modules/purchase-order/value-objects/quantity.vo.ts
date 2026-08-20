import { DomainException } from '../../../shared/domain/domain.exception';

export class Quantity {
  private constructor(
    private readonly amount: number,
  ) {
    if (!Number.isInteger(amount)) {
      throw new DomainException(
        'A quantidade deve ser um número inteiro',
      );
    }

    if (amount <= 0) {
      throw new DomainException(
        'A quantidade deve ser maior que zero',
      );
    }
  }

  static create(amount: number): Quantity {
    return new Quantity(amount);
  }

  equals(other: Quantity): boolean {
    return this.amount === other.amount;
  }

  get value(): number {
    return this.amount;
  }
}
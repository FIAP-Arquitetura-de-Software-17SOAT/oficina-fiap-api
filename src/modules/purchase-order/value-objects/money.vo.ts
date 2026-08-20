import { DomainException } from '../../../shared/domain/domain.exception';

export class Money {
  private constructor(
    private readonly cents: number,
  ) {
    if (!Number.isInteger(cents)) {
      throw new DomainException(
        'O valor monetário deve ser representado em centavos inteiros',
      );
    }

    if (cents < 0) {
      throw new DomainException(
        'O valor monetário não pode ser negativo',
      );
    }
  }

  static fromCents(cents: number): Money {
    return new Money(cents);
  }

  static fromDecimal(value: number): Money {
    if (!Number.isFinite(value)) {
      throw new DomainException(
        'O valor monetário informado é inválido',
      );
    }

    return new Money(
      Math.round(value * 100),
    );
  }

  add(other: Money): Money {
    return Money.fromCents(
      this.cents + other.cents,
    );
  }

  multiply(quantity: number): Money {
    if (!Number.isInteger(quantity)) {
      throw new DomainException(
        'A quantidade utilizada no cálculo deve ser inteira',
      );
    }

    return Money.fromCents(
      this.cents * quantity,
    );
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  get valueInCents(): number {
    return this.cents;
  }

  get value(): number {
    return this.cents / 100;
  }
}
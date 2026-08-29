import { DomainException } from '../domain.exception';

export class Money {
  private constructor(private readonly cents: number) {
    if (!Number.isInteger(cents)) {
      throw new DomainException(
        'O valor monetário deve ser representado em centavos inteiros',
      );
    }

    if (cents < 0) {
      throw new DomainException('O valor monetário não pode ser negativo');
    }
  }

  static fromCents(cents: number): Money {
    return new Money(cents);
  }

  static fromDecimal(value: number): Money {
    if (!Number.isFinite(value)) {
      throw new DomainException('O valor monetário informado é inválido');
    }

    return new Money(Math.round(value * 100));
  }

  add(other: Money): Money {
    return Money.fromCents(this.cents + other.cents);
  }

  /**
   * Multiplica pelo número de itens. A quantidade pode ser fracionária porque
   * item de orçamento é medido em litro e quilo além de unidade (2,5 L de
   * óleo); o resultado é arredondado para o centavo, que é a menor unidade que
   * o domínio conhece.
   *
   * O estoque continua restrito a inteiros, mas quem garante isso é o VO
   * `Quantity`, não este método — é lá que a regra 17 mora.
   */
  multiply(quantity: number): Money {
    if (!Number.isFinite(quantity)) {
      throw new DomainException('A quantidade utilizada no cálculo é inválida');
    }

    if (quantity < 0) {
      throw new DomainException(
        'A quantidade utilizada no cálculo não pode ser negativa',
      );
    }

    return Money.fromCents(Math.round(this.cents * quantity));
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

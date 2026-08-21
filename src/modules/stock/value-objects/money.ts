import { DomainException } from '../../../shared/domain/domain.exception';

const MONEY_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/;
const MAX_INTEGER_DIGITS = 10;

export class Money {
  private constructor(private readonly value: string) {}

  static create(input: string): Money {
    const value = (input ?? '').trim();
    const match = MONEY_PATTERN.exec(value);

    if (!match) {
      throw new DomainException('Valor monetário inválido');
    }

    const integerPart = match[1].replace(/^0+(?=\d)/, '');

    if (integerPart.length > MAX_INTEGER_DIGITS) {
      throw new DomainException('Valor monetário excede o limite permitido');
    }

    const decimalPart = (match[2] ?? '').padEnd(2, '0');

    return new Money(`${integerPart}.${decimalPart}`);
  }

  getValue(): string {
    return this.value;
  }

  equals(other: Money): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

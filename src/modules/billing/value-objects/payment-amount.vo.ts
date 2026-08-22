import { DomainException } from '../../../shared/domain/domain.exception';

export class PaymentAmount {
  private constructor(private readonly cents: number) {
    if (!Number.isInteger(cents) || cents <= 0) {
      throw new DomainException('Payment amount must be greater than zero');
    }
  }

  static fromCents(cents: number): PaymentAmount {
    return new PaymentAmount(cents);
  }

  static fromDecimal(value: number): PaymentAmount {
    if (!Number.isFinite(value) || value <= 0) {
      throw new DomainException('Payment amount must be greater than zero');
    }

    return new PaymentAmount(Math.round(value * 100));
  }

  get valueInCents(): number {
    return this.cents;
  }

  get value(): number {
    return this.cents / 100;
  }
}

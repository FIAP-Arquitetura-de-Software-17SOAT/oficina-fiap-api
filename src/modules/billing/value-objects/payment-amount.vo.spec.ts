import { DomainException } from '../../../shared/domain/domain.exception';
import { PaymentAmount } from './payment-amount.vo';

describe('PaymentAmount', () => {
  it('creates from cents', () => {
    const amount = PaymentAmount.fromCents(12345);

    expect(amount.valueInCents).toBe(12345);
    expect(amount.value).toBe(123.45);
  });

  it('creates from decimal', () => {
    const amount = PaymentAmount.fromDecimal(99.9);

    expect(amount.valueInCents).toBe(9990);
    expect(amount.value).toBe(99.9);
  });

  it.each([0, -1, 10.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid cents %s',
    (value) => {
      expect(() => PaymentAmount.fromCents(value)).toThrow(DomainException);
    },
  );

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid decimal %s',
    (value) => {
      expect(() => PaymentAmount.fromDecimal(value)).toThrow(DomainException);
    },
  );
});

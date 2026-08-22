import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentAmount } from '../value-objects/payment-amount.vo';
import { Payment } from './payment.entity';

describe('Payment', () => {
  it('creates a payment with generated id and default dates', () => {
    const payment = Payment.create({
      amount: PaymentAmount.fromDecimal(120),
      method: PaymentMethod.PIX,
    });

    expect(payment.getId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(payment.getAmount().valueInCents).toBe(12000);
    expect(payment.getMethod()).toBe(PaymentMethod.PIX);
    expect(payment.getPaidAt()).toBeInstanceOf(Date);
    expect(payment.getCreatedAt()).toBeInstanceOf(Date);
  });

  it('restores a payment preserving id and dates', () => {
    const paidAt = new Date('2026-08-20T10:00:00.000Z');
    const createdAt = new Date('2026-08-20T10:01:00.000Z');

    const payment = Payment.restore('f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
      amount: PaymentAmount.fromCents(5000),
      method: PaymentMethod.CASH,
      paidAt,
      createdAt,
    });

    expect(payment.getId()).toBe('f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c');
    expect(payment.getAmount().value).toBe(50);
    expect(payment.getPaidAt()).toBe(paidAt);
    expect(payment.getCreatedAt()).toBe(createdAt);
  });
});

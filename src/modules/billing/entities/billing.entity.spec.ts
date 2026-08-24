import { DomainException } from '../../../shared/domain/domain.exception';
import { Money } from '../../../shared/domain/value-objects/money.vo';
import { BillingStatus } from '../enums/billing-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import { Billing } from './billing.entity';

const serviceOrderId = 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c';
const budgetId = 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

describe('Billing', () => {
  it('creates a pending billing with positive money', () => {
    const billing = Billing.create({
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(15000),
    });

    expect(billing.getServiceOrderId()).toBe(serviceOrderId);
    expect(billing.getBudgetId()).toBe(budgetId);
    expect(billing.getAmount().valueInCents).toBe(15000);
    expect(billing.getStatus()).toBe(BillingStatus.PENDING);
    expect(billing.getPaymentLink()).toBeNull();
  });

  it('rejects zero-value billing', () => {
    expect(() =>
      Billing.create({
        serviceOrderId,
        budgetId,
        amount: Money.fromCents(0),
      }),
    ).toThrow(new DomainException('Billing amount must be greater than zero'));
  });

  it('moves pending billing to waiting payment with link data', () => {
    const billing = Billing.create({
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(15000),
    });
    const expiresAt = new Date('2026-08-23T10:00:00.000Z');

    billing.generatePaymentLink({
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
      gatewayTransactionId: 'cs_test_123',
      expiresAt,
    });

    expect(billing.getStatus()).toBe(BillingStatus.WAITING_PAYMENT);
    expect(billing.getPaymentLink()).toBe(
      'https://checkout.stripe.com/c/pay/cs_test_123',
    );
    expect(billing.getGatewayTransactionId()).toBe('cs_test_123');
    expect(billing.getExpiresAt()).toBe(expiresAt);
  });

  it('registers payment once for the same gateway transaction', () => {
    const billing = Billing.create({
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(15000),
    });
    billing.generatePaymentLink({
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
      gatewayTransactionId: 'cs_test_123',
      expiresAt: new Date('2026-08-23T10:00:00.000Z'),
    });

    const first = billing.registerPayment({
      gatewayTransactionId: 'cs_test_123',
      method: PaymentMethod.CARD,
      paidAt: new Date('2026-08-22T10:00:00.000Z'),
    });
    const second = billing.registerPayment({
      gatewayTransactionId: 'cs_test_123',
      method: PaymentMethod.CARD,
      paidAt: new Date('2026-08-22T10:01:00.000Z'),
    });

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(billing.getStatus()).toBe(BillingStatus.PAID);
    expect(billing.getPaymentMethod()).toBe(PaymentMethod.CARD);
    expect(billing.getPaidAt()?.toISOString()).toBe('2026-08-22T10:00:00.000Z');
  });

  it('rejects a different transaction after payment', () => {
    const billing = Billing.restore('bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(15000),
      status: BillingStatus.PAID,
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
      gatewayTransactionId: 'cs_test_123',
      paymentMethod: PaymentMethod.CARD,
      paidAt: new Date('2026-08-22T10:00:00.000Z'),
    });

    expect(() =>
      billing.registerPayment({
        gatewayTransactionId: 'cs_test_other',
        method: PaymentMethod.CARD,
      }),
    ).toThrow('Paid billing is terminal');
  });

  it('expires unpaid billing before payment', () => {
    const billing = Billing.create({
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(15000),
    });
    billing.generatePaymentLink({
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
      gatewayTransactionId: 'cs_test_123',
      expiresAt: new Date('2026-08-23T10:00:00.000Z'),
    });

    billing.expire(new Date('2026-08-23T10:01:00.000Z'));

    expect(billing.getStatus()).toBe(BillingStatus.EXPIRED);
  });

  it('does not calculate penalty before payment link expiration', () => {
    const billing = Billing.create({
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(10000),
    });
    billing.generatePaymentLink({
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
      gatewayTransactionId: 'cs_test_123',
      expiresAt: new Date('2026-08-23T10:00:00.000Z'),
    });

    const penalty = billing.calculatePenalty(
      new Date('2026-08-23T09:59:00.000Z'),
    );

    expect(penalty).toBeNull();
  });

  it('calculates penalty from expiresAt without changing original amount', () => {
    const billing = Billing.create({
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(10000),
    });
    billing.generatePaymentLink({
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
      gatewayTransactionId: 'cs_test_123',
      expiresAt: new Date('2026-08-20T10:00:00.000Z'),
    });

    const penalty = billing.calculatePenalty(
      new Date('2026-08-21T10:00:00.000Z'),
    );

    expect(penalty?.getOverdueDays()).toBe(1);
    expect(penalty?.getTotalAmount().valueInCents).toBe(10203);
    expect(billing.getAmount().valueInCents).toBe(10000);
  });
});

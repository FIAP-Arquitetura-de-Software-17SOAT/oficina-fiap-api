import { DomainException } from '../../../../shared/domain/domain.exception';
import { Money } from '../../../../shared/domain/value-objects/money.vo';
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
    ).toThrow(new DomainException('Valor da cobrança deve ser maior que zero'));
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
    ).toThrow('Cobrança paga é terminal');
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

  describe('transições inválidas', () => {
    const base = {
      serviceOrderId: 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      budgetId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      amount: Money.fromCents(15000),
    };
    const link = {
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
      gatewayTransactionId: 'cs_test_123',
      expiresAt: new Date('2026-08-23T10:00:00.000Z'),
    };
    const payment = {
      gatewayTransactionId: 'cs_test_123',
      method: PaymentMethod.CARD,
    };

    it('only generates a link for a pending billing', () => {
      const billing = Billing.create(base);
      billing.generatePaymentLink(link);

      expect(() => billing.generatePaymentLink(link)).toThrow(
        'Link de pagamento só pode ser gerado para cobrança pendente',
      );
    });

    it('only renews an expired link of an unpaid billing', () => {
      const waiting = Billing.create(base);
      waiting.generatePaymentLink(link);
      expect(() =>
        waiting.renewPaymentLink(link, new Date('2026-08-22T10:00:00.000Z')),
      ).toThrow('O link de pagamento da cobrança ainda não expirou');

      waiting.registerPayment(payment);
      expect(() =>
        waiting.renewPaymentLink(link, new Date('2026-08-24T10:00:00.000Z')),
      ).toThrow('Cobrança paga é terminal');
    });

    it('only registers a payment while waiting for it', () => {
      const pending = Billing.create(base);
      expect(() => pending.registerPayment(payment)).toThrow(
        'Pagamento só pode ser registrado com a cobrança aguardando pagamento',
      );

      const waiting = Billing.create(base);
      waiting.generatePaymentLink(link);
      expect(() =>
        waiting.registerPayment({
          ...payment,
          gatewayTransactionId: 'cs_other',
        }),
      ).toThrow('A transação do gateway não corresponde à cobrança');

      waiting.registerPayment(payment);
      expect(() =>
        waiting.registerPayment({
          ...payment,
          gatewayTransactionId: 'cs_other',
        }),
      ).toThrow('Cobrança paga é terminal');
    });

    it('does not expire a paid billing nor a link still valid', () => {
      const paid = Billing.create(base);
      paid.generatePaymentLink(link);
      paid.registerPayment(payment);
      expect(() => paid.expire()).toThrow('Cobrança paga é terminal');

      const waiting = Billing.create(base);
      waiting.generatePaymentLink(link);
      expect(() =>
        waiting.expire(new Date('2026-08-22T10:00:00.000Z')),
      ).toThrow('O link de pagamento da cobrança ainda não expirou');

      waiting.expire(new Date('2026-08-24T10:00:00.000Z'));
      expect(() => waiting.expire()).not.toThrow();
      expect(waiting.getStatus()).toBe(BillingStatus.EXPIRED);
    });
  });
});

import { DomainException } from '../../../shared/domain/domain.exception';
import { BillingStatus } from '../enums/billing-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentAmount } from '../value-objects/payment-amount.vo';
import { Billing } from './billing.entity';

const serviceOrderId = 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

describe('Billing', () => {
  it('creates an open billing with no payments', () => {
    const billing = Billing.create({
      serviceOrderId,
      totalAmountInCents: 15000,
    });

    expect(billing.getId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(billing.getServiceOrderId()).toBe(serviceOrderId);
    expect(billing.getTotalAmountInCents()).toBe(15000);
    expect(billing.getPaidAmountInCents()).toBe(0);
    expect(billing.getBalanceAmountInCents()).toBe(15000);
    expect(billing.getStatus()).toBe(BillingStatus.OPEN);
  });

  it('rejects empty service order id', () => {
    expect(() =>
      Billing.create({ serviceOrderId: '   ', totalAmountInCents: 100 }),
    ).toThrow(DomainException);
  });

  it('rejects non-positive total', () => {
    expect(() =>
      Billing.create({ serviceOrderId, totalAmountInCents: 0 }),
    ).toThrow('Billing total must be greater than zero');
  });

  it('registers a partial payment', () => {
    const billing = Billing.create({
      serviceOrderId,
      totalAmountInCents: 15000,
    });

    const payment = billing.registerPayment({
      amount: PaymentAmount.fromDecimal(50),
      method: PaymentMethod.PIX,
    });

    expect(payment.getAmount().valueInCents).toBe(5000);
    expect(billing.getPaidAmountInCents()).toBe(5000);
    expect(billing.getBalanceAmountInCents()).toBe(10000);
    expect(billing.getStatus()).toBe(BillingStatus.PARTIALLY_PAID);
  });

  it('registers the final payment and marks billing as paid', () => {
    const billing = Billing.create({
      serviceOrderId,
      totalAmountInCents: 15000,
    });

    billing.registerPayment({
      amount: PaymentAmount.fromCents(10000),
      method: PaymentMethod.CREDIT_CARD,
    });
    billing.registerPayment({
      amount: PaymentAmount.fromCents(5000),
      method: PaymentMethod.CASH,
    });

    expect(billing.getPaidAmountInCents()).toBe(15000);
    expect(billing.getBalanceAmountInCents()).toBe(0);
    expect(billing.getStatus()).toBe(BillingStatus.PAID);
  });

  it('rejects overpayment', () => {
    const billing = Billing.create({
      serviceOrderId,
      totalAmountInCents: 15000,
    });

    expect(() =>
      billing.registerPayment({
        amount: PaymentAmount.fromCents(15001),
        method: PaymentMethod.PIX,
      }),
    ).toThrow('Payment amount exceeds billing balance');
  });

  it('rejects payment when cancelled', () => {
    const billing = Billing.create({
      serviceOrderId,
      totalAmountInCents: 15000,
    });

    billing.cancel();

    expect(() =>
      billing.registerPayment({
        amount: PaymentAmount.fromCents(100),
        method: PaymentMethod.PIX,
      }),
    ).toThrow('Cancelled billing cannot receive payments');
  });

  it('restores with existing payments and derived status', () => {
    const billing = Billing.restore('aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
      serviceOrderId,
      totalAmountInCents: 15000,
      status: BillingStatus.PARTIALLY_PAID,
      payments: [
        {
          id: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
          amountInCents: 5000,
          method: PaymentMethod.PIX,
          paidAt: new Date('2026-08-20T10:00:00.000Z'),
          createdAt: new Date('2026-08-20T10:00:00.000Z'),
        },
      ],
      createdAt: new Date('2026-08-20T10:00:00.000Z'),
      updatedAt: new Date('2026-08-20T10:00:00.000Z'),
    });

    expect(billing.getId()).toBe('aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c');
    expect(billing.getPaidAmountInCents()).toBe(5000);
    expect(billing.getBalanceAmountInCents()).toBe(10000);
    expect(billing.getPayments()).toHaveLength(1);
  });
});

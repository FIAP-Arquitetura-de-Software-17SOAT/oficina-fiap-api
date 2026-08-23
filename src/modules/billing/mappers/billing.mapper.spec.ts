import { Money } from '../../../shared/domain/value-objects/money.vo';
import { Billing } from '../entities/billing.entity';
import { BillingStatus } from '../enums/billing-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import { BillingMapper } from './billing.mapper';

const serviceOrderId = 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c';
const budgetId = 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c';
const generatedAt = new Date('2026-08-22T10:00:00.000Z');
const expiresAt = new Date('2026-08-23T10:00:00.000Z');

describe('BillingMapper', () => {
  it('maps gateway-backed billing to persistence', () => {
    const billing = Billing.restore('bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(15000),
      status: BillingStatus.WAITING_PAYMENT,
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
      gatewayTransactionId: 'cs_test_123',
      paymentMethod: null,
      generatedAt,
      paidAt: null,
      expiresAt,
      createdAt: generatedAt,
      updatedAt: generatedAt,
    });

    expect(BillingMapper.toPersistence(billing)).toEqual({
      id: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      serviceOrderId,
      budgetId,
      amountCents: 15000,
      status: BillingStatus.WAITING_PAYMENT,
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
      gatewayTransactionId: 'cs_test_123',
      paymentMethod: null,
      generatedAt,
      paidAt: null,
      expiresAt,
      createdAt: generatedAt,
      updatedAt: generatedAt,
    });
  });

  it('maps gateway-backed persistence record to domain', () => {
    const billing = BillingMapper.toDomain({
      id: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      serviceOrderId,
      budgetId,
      amountCents: 15000,
      status: BillingStatus.PAID,
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
      gatewayTransactionId: 'cs_test_123',
      paymentMethod: PaymentMethod.CARD,
      generatedAt,
      paidAt: generatedAt,
      expiresAt,
      createdAt: generatedAt,
      updatedAt: generatedAt,
    });

    expect(billing.getAmount().valueInCents).toBe(15000);
    expect(billing.getBudgetId()).toBe(budgetId);
    expect(billing.getPaymentMethod()).toBe(PaymentMethod.CARD);
    expect(billing.getPaidAt()).toBe(generatedAt);
  });

  it('maps overdue penalty details to response', () => {
    const billing = Billing.restore('bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(10000),
      status: BillingStatus.WAITING_PAYMENT,
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
      gatewayTransactionId: 'cs_test_123',
      generatedAt,
      expiresAt: new Date('2026-08-20T10:00:00.000Z'),
      createdAt: generatedAt,
      updatedAt: generatedAt,
    });
    const calculatedAt = new Date('2026-08-21T10:00:00.000Z');

    expect(BillingMapper.toResponse(billing, calculatedAt).penalty).toEqual({
      originalAmount: 100,
      fixedPenaltyAmount: 2,
      interestAmount: 0.03,
      overdueDays: 1,
      totalAmount: 102.03,
      calculatedAt,
    });
  });
});

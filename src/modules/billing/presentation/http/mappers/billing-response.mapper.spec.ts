import { Money } from '../../../../../shared/domain/value-objects/money.vo';
import { Billing } from '../../../domain/entities/billing.entity';
import { BillingStatus } from '../../../domain/enums/billing-status.enum';
import { BillingResponseMapper } from './billing-response.mapper';

const serviceOrderId = 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c';
const budgetId = 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c';
const generatedAt = new Date('2026-08-22T10:00:00.000Z');

const waiting = (expiresAt: Date) =>
  Billing.restore('bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
    serviceOrderId,
    budgetId,
    amount: Money.fromCents(10000),
    status: BillingStatus.WAITING_PAYMENT,
    paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
    gatewayTransactionId: 'cs_test_123',
    generatedAt,
    expiresAt,
    createdAt: generatedAt,
    updatedAt: generatedAt,
  });

describe('BillingResponseMapper', () => {
  it('maps overdue penalty details to response', () => {
    const calculatedAt = new Date('2026-08-21T10:00:00.000Z');

    const response = BillingResponseMapper.toResponse(
      waiting(new Date('2026-08-20T10:00:00.000Z')),
      calculatedAt,
    );

    expect(response.amount).toBe(100);
    expect(response.amountDue).toBe(102.03);
    expect(response.penalty).toEqual({
      originalAmount: 100,
      fixedPenaltyAmount: 2,
      interestAmount: 0.03,
      overdueDays: 1,
      totalAmount: 102.03,
      calculatedAt,
    });
  });

  it('uses the original amount as amount due when billing is not overdue', () => {
    const [response] = BillingResponseMapper.toResponseList([
      waiting(new Date('2099-08-22T10:00:00.000Z')),
    ]);

    expect(response.amount).toBe(100);
    expect(response.amountDue).toBe(100);
    expect(response.penalty).toBeNull();
  });

  it('flattens the payment return with the service order status', () => {
    expect(
      BillingResponseMapper.toPaymentReturnResponse({
        billing: waiting(new Date('2099-08-22T10:00:00.000Z')),
        serviceOrder: {
          id: serviceOrderId,
          clientId: 'c-1',
          status: 'DELIVERED',
        },
      }),
    ).toEqual({
      billingId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      serviceOrderId,
      billingStatus: BillingStatus.WAITING_PAYMENT,
      serviceOrderStatus: 'DELIVERED',
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
    });
  });
});

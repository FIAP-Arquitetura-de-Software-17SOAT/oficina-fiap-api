import { BillingStatus } from '../enums/billing-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentAmount } from '../value-objects/payment-amount.vo';
import { Billing } from '../entities/billing.entity';
import { BillingMapper } from './billing.mapper';

describe('BillingMapper', () => {
  it('maps domain to response with decimal amounts', () => {
    const billing = Billing.create({
      serviceOrderId: 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      totalAmountInCents: 12000,
    });
    billing.registerPayment({
      amount: PaymentAmount.fromCents(7000),
      method: PaymentMethod.PIX,
    });

    const response = BillingMapper.toResponse(billing);

    expect(response).toMatchObject({
      id: billing.getId(),
      serviceOrderId: billing.getServiceOrderId(),
      status: BillingStatus.PARTIALLY_PAID,
      totalAmount: 120,
      paidAmount: 70,
      balanceAmount: 50,
    });
    expect(response.payments).toHaveLength(1);
  });

  it('maps persistence record to domain', () => {
    const billing = BillingMapper.toDomain({
      id: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      serviceOrderId: 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      status: BillingStatus.PAID,
      totalCents: 12000,
      paidCents: 12000,
      balanceCents: 0,
      createdAt: new Date('2026-08-20T10:00:00.000Z'),
      updatedAt: new Date('2026-08-20T10:00:00.000Z'),
      payments: [
        {
          id: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
          billingId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
          amountCents: 12000,
          method: PaymentMethod.CASH,
          paidAt: new Date('2026-08-20T10:00:00.000Z'),
          createdAt: new Date('2026-08-20T10:00:00.000Z'),
        },
      ],
    });

    expect(billing.getStatus()).toBe(BillingStatus.PAID);
    expect(billing.getBalanceAmountInCents()).toBe(0);
  });
});

import { BadRequestException } from '@nestjs/common';
import { Money } from '../../../shared/domain/value-objects/money.vo';
import { Billing } from '../entities/billing.entity';
import { BillingStatus } from '../enums/billing-status.enum';
import { BillingService } from '../services/billing.service';
import { BillingController } from './billing.controller';

const serviceOrderId = 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

describe('BillingController', () => {
  let service: jest.Mocked<BillingService>;
  let controller: BillingController;

  beforeEach(() => {
    service = {
      generateForServiceOrder: jest.fn(),
      handlePaymentWebhook: jest.fn(),
      expire: jest.fn(),
      renewPaymentLink: jest.fn(),
      findById: jest.fn(),
      findByServiceOrderId: jest.fn(),
      findAll: jest.fn(),
      deliverServiceOrder: jest.fn(),
    } as unknown as jest.Mocked<BillingService>;
    controller = new BillingController(service);
  });

  it('generates billing', async () => {
    const billing = Billing.create({
      serviceOrderId,
      budgetId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      amount: Money.fromCents(12000),
    });
    service.generateForServiceOrder.mockResolvedValue(billing);

    const response = await controller.generate({ serviceOrderId });

    expect(service.generateForServiceOrder.mock.calls).toEqual([
      [{ serviceOrderId }],
    ]);
    expect(response.amount).toBe(120);
  });

  it('passes raw Stripe webhook body and signature to billing service', async () => {
    const request = { rawBody: Buffer.from('{"id":"evt_123"}') };

    await controller.handleStripeWebhook(request as never, 'stripe-signature');

    expect(service.handlePaymentWebhook.mock.calls).toEqual([
      [request.rawBody, 'stripe-signature'],
    ]);
  });

  it.each([undefined, '', '   '])(
    'rejects a missing or blank Stripe signature header: %p',
    async (signature) => {
      const request = { rawBody: Buffer.from('{"id":"evt_123"}') };

      await expect(
        controller.handleStripeWebhook(request as never, signature as never),
      ).rejects.toThrow(BadRequestException);
      expect(service.handlePaymentWebhook.mock.calls).toHaveLength(0);
    },
  );

  it('expires billing', async () => {
    const billing = Billing.create({
      serviceOrderId,
      budgetId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      amount: Money.fromCents(12000),
    });
    billing.expire();
    service.expire.mockResolvedValue(billing);

    const response = await controller.expire(billing.getId());

    expect(service.expire.mock.calls).toEqual([[billing.getId()]]);
    expect(response.status).toBe(BillingStatus.EXPIRED);
  });

  it('renews billing payment link', async () => {
    const billing = Billing.create({
      serviceOrderId,
      budgetId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      amount: Money.fromCents(12000),
    });
    billing.generatePaymentLink({
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_renewed',
      gatewayTransactionId: 'cs_test_renewed',
      expiresAt: new Date('2026-08-24T10:00:00.000Z'),
    });
    service.renewPaymentLink.mockResolvedValue(billing);

    const response = await controller.renewPaymentLink(billing.getId());

    expect(service.renewPaymentLink.mock.calls).toEqual([[billing.getId()]]);
    expect(response.paymentLink).toBe(
      'https://checkout.stripe.com/c/pay/cs_test_renewed',
    );
  });
});

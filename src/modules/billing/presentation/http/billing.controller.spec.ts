import { BadRequestException } from '@nestjs/common';
import { Money } from '../../../../shared/domain/value-objects/money.vo';
import { DeliverBilledServiceOrderUseCase } from '../../application/use-cases/deliver-billed-service-order.use-case';
import { ExpireBillingUseCase } from '../../application/use-cases/expire-billing.use-case';
import { FindBillingByServiceOrderUseCase } from '../../application/use-cases/find-billing-by-service-order.use-case';
import { FindBillingUseCase } from '../../application/use-cases/find-billing.use-case';
import { GenerateBillingUseCase } from '../../application/use-cases/generate-billing.use-case';
import { HandlePaymentWebhookUseCase } from '../../application/use-cases/handle-payment-webhook.use-case';
import { ListBillingsUseCase } from '../../application/use-cases/list-billings.use-case';
import { RenewPaymentLinkUseCase } from '../../application/use-cases/renew-payment-link.use-case';
import { Billing } from '../../domain/entities/billing.entity';
import { BillingStatus } from '../../domain/enums/billing-status.enum';
import { BillingController } from './billing.controller';

const serviceOrderId = 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

describe('BillingController', () => {
  let service: {
    generateForServiceOrder: jest.Mock;
    handlePaymentWebhook: jest.Mock;
    expire: jest.Mock;
    renewPaymentLink: jest.Mock;
    findById: jest.Mock;
    findByServiceOrderId: jest.Mock;
    findAll: jest.Mock;
    deliverServiceOrder: jest.Mock;
  };
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
    };
    const useCase = <T>(execute: jest.Mock) => ({ execute }) as unknown as T;
    controller = new BillingController(
      useCase<GenerateBillingUseCase>(service.generateForServiceOrder),
      useCase<FindBillingUseCase>(service.findById),
      useCase<FindBillingByServiceOrderUseCase>(service.findByServiceOrderId),
      useCase<ListBillingsUseCase>(service.findAll),
      useCase<HandlePaymentWebhookUseCase>(service.handlePaymentWebhook),
      useCase<ExpireBillingUseCase>(service.expire),
      useCase<RenewPaymentLinkUseCase>(service.renewPaymentLink),
      useCase<DeliverBilledServiceOrderUseCase>(service.deliverServiceOrder),
    );
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

  it('lists, finds by id or by service order, and delivers', async () => {
    const billing = Billing.create({
      serviceOrderId,
      budgetId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      amount: Money.fromCents(12000),
    });
    service.findAll.mockResolvedValue([billing]);
    service.findByServiceOrderId.mockResolvedValue(billing);
    service.findById.mockResolvedValue(billing);
    service.deliverServiceOrder.mockResolvedValue(undefined);

    await expect(controller.findAll({})).resolves.toHaveLength(1);
    await expect(controller.findAll({ serviceOrderId })).resolves.toHaveLength(
      1,
    );
    expect(service.findByServiceOrderId).toHaveBeenCalledWith(serviceOrderId);
    await expect(controller.findById(billing.getId())).resolves.toMatchObject({
      id: billing.getId(),
    });
    await controller.deliverServiceOrder(billing.getId());
    expect(service.deliverServiceOrder).toHaveBeenCalledWith(billing.getId());
  });

  it('rejects a Stripe webhook without raw body', async () => {
    await expect(
      controller.handleStripeWebhook({} as never, 'stripe-signature'),
    ).rejects.toThrow(BadRequestException);
  });
});

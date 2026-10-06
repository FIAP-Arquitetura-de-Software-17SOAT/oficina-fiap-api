import { Money } from '../../../../shared/domain/value-objects/money.vo';
import { Billing } from '../../domain/entities/billing.entity';
import { BillingStatus } from '../../domain/enums/billing-status.enum';
import { PaymentMethod } from '../../domain/enums/payment-method.enum';
import { AcceptedBudgetPort } from '../ports/accepted-budget.port';
import { BillingNotifierPort } from '../ports/billing-notifier.port';
import { BillingRepositoryPort } from '../ports/billing-repository.port';
import {
  InvalidPaymentWebhookSignatureError,
  PaymentGatewayPort,
} from '../ports/payment-gateway.port';
import {
  ServiceOrderPort,
  ServiceOrderSummary,
} from '../ports/service-order.port';
import { BillingStore } from '../services/billing-store';
import { PaymentLinkIssuer } from '../services/payment-link-issuer';
import { PaymentSettlement } from '../services/payment-settlement';
import { ConfirmPaymentReturnUseCase } from './confirm-payment-return.use-case';
import { DeliverBilledServiceOrderUseCase } from './deliver-billed-service-order.use-case';
import { ExpireBillingUseCase } from './expire-billing.use-case';
import { FindBillingByServiceOrderUseCase } from './find-billing-by-service-order.use-case';
import { FindBillingUseCase } from './find-billing.use-case';
import { GenerateBillingUseCase } from './generate-billing.use-case';
import { HandlePaymentWebhookUseCase } from './handle-payment-webhook.use-case';
import { ListBillingsUseCase } from './list-billings.use-case';
import { RegisterPaymentCancellationUseCase } from './register-payment-cancellation.use-case';
import { RenewPaymentLinkUseCase } from './renew-payment-link.use-case';

const serviceOrderId = 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c';
const budgetId = 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c';
const billingId = 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c';
const clientId = 'cccccccc-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

type Mocked<T> = { [K in keyof T]: jest.Mock };

const serviceOrder = (status: string): ServiceOrderSummary => ({
  id: serviceOrderId,
  clientId,
  status,
});

const pendingBilling = (updatedAt = new Date('2026-08-22T09:00:00.000Z')) =>
  Billing.restore(billingId, {
    serviceOrderId,
    budgetId,
    amount: Money.fromCents(15000),
    createdAt: updatedAt,
    updatedAt,
  });

const waitingBilling = (
  overrides: Partial<Parameters<typeof Billing.restore>[1]> = {},
) =>
  Billing.restore(billingId, {
    serviceOrderId,
    budgetId,
    amount: Money.fromCents(15000),
    status: BillingStatus.WAITING_PAYMENT,
    paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
    gatewayTransactionId: 'cs_test_123',
    ...overrides,
  });

const link = (id: string) => ({
  paymentLink: `https://checkout.stripe.com/c/pay/${id}`,
  gatewayTransactionId: id,
  expiresAt: new Date('2026-08-23T10:00:00.000Z'),
});

const confirmed = (gatewayTransactionId: string, paidAt: Date) => ({
  type: 'payment_confirmed' as const,
  gatewayTransactionId,
  method: PaymentMethod.CARD,
  paidAt,
});

describe('billing use cases', () => {
  let repository: Mocked<BillingRepositoryPort>;
  let serviceOrders: Mocked<ServiceOrderPort>;
  let acceptedBudgets: Mocked<AcceptedBudgetPort>;
  let gateway: Mocked<PaymentGatewayPort>;
  let notifier: Mocked<BillingNotifierPort>;
  let generate: GenerateBillingUseCase;
  let find: FindBillingUseCase;
  let findByServiceOrder: FindBillingByServiceOrderUseCase;
  let list: ListBillingsUseCase;
  let expire: ExpireBillingUseCase;
  let renew: RenewPaymentLinkUseCase;
  let webhook: HandlePaymentWebhookUseCase;
  let confirmReturn: ConfirmPaymentReturnUseCase;
  let cancelReturn: RegisterPaymentCancellationUseCase;
  let deliver: DeliverBilledServiceOrderUseCase;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByServiceOrderId: jest.fn(),
      findByGatewayTransactionId: jest.fn(),
      findAll: jest.fn(),
      registerCheckoutSession: jest.fn().mockResolvedValue(undefined),
      recordCheckoutSessionPayment: jest.fn().mockResolvedValue(undefined),
      update: jest.fn((billing: Billing) => Promise.resolve(billing)),
    };
    serviceOrders = {
      findById: jest.fn().mockResolvedValue(serviceOrder('COMPLETED')),
      awaitPayment: jest.fn(),
      deliver: jest.fn(),
    };
    acceptedBudgets = { findAccepted: jest.fn() };
    gateway = {
      createPaymentLink: jest.fn(),
      parsePaymentWebhook: jest.fn(),
      getPaymentStatus: jest.fn(),
    };
    notifier = { paymentLinkReady: jest.fn().mockResolvedValue(undefined) };

    const store = new BillingStore(repository, serviceOrders);
    const issuer = new PaymentLinkIssuer(repository, gateway);
    const settlement = new PaymentSettlement(
      repository,
      store,
      gateway,
      serviceOrders,
    );
    generate = new GenerateBillingUseCase(
      repository,
      store,
      acceptedBudgets,
      issuer,
      notifier,
    );
    find = new FindBillingUseCase(store);
    findByServiceOrder = new FindBillingByServiceOrderUseCase(repository);
    list = new ListBillingsUseCase(repository);
    expire = new ExpireBillingUseCase(store);
    renew = new RenewPaymentLinkUseCase(store, issuer);
    webhook = new HandlePaymentWebhookUseCase(store, gateway, settlement);
    confirmReturn = new ConfirmPaymentReturnUseCase(store, settlement);
    cancelReturn = new RegisterPaymentCancellationUseCase(
      store,
      serviceOrders,
      settlement,
    );
    deliver = new DeliverBilledServiceOrderUseCase(store, serviceOrders);
  });

  describe('gerar cobrança', () => {
    it('creates the billing from the accepted budget and stores the payment link', async () => {
      const created = pendingBilling();
      acceptedBudgets.findAccepted.mockResolvedValue({
        id: budgetId,
        total: Money.fromCents(15000),
      });
      repository.findByServiceOrderId.mockResolvedValue(null);
      repository.create.mockResolvedValue(created);
      gateway.createPaymentLink.mockResolvedValue(link('cs_test_123'));

      const billing = await generate.execute({
        serviceOrderId: ` ${serviceOrderId} `,
      });

      expect(billing.getStatus()).toBe(BillingStatus.WAITING_PAYMENT);
      expect(billing.getPaymentLink()).toBe(
        'https://checkout.stripe.com/c/pay/cs_test_123',
      );
      expect(repository.create.mock.calls[0][0].getAmount().valueInCents).toBe(
        15000,
      );
      expect(gateway.createPaymentLink).toHaveBeenCalledWith({
        billingId,
        serviceOrderId,
        amountInCents: 15000,
        idempotencyKey: expect.stringMatching(
          new RegExp(`^billing-payment-link:${billingId}:`),
        ),
      });
      expect(repository.update).toHaveBeenCalledWith(
        billing,
        new Date('2026-08-22T09:00:00.000Z'),
      );
      expect(repository.registerCheckoutSession).toHaveBeenCalledWith(
        billingId,
        'cs_test_123',
      );
      expect(notifier.paymentLinkReady).toHaveBeenCalledWith({
        serviceOrderId,
        total: 150,
        paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
      });
    });

    it('retries only the payment link for a pending billing', async () => {
      repository.findByServiceOrderId.mockResolvedValue(pendingBilling());
      gateway.createPaymentLink.mockResolvedValue(link('cs_test_retry'));

      const billing = await generate.execute({ serviceOrderId });

      expect(billing.getStatus()).toBe(BillingStatus.WAITING_PAYMENT);
      expect(billing.getPaymentLink()).toContain('cs_test_retry');
      expect(repository.create).not.toHaveBeenCalled();
      expect(acceptedBudgets.findAccepted).not.toHaveBeenCalled();
    });

    it('recovers a pending billing after the gateway fails', async () => {
      const created = pendingBilling();
      acceptedBudgets.findAccepted.mockResolvedValue({
        id: budgetId,
        total: Money.fromCents(15000),
      });
      repository.findByServiceOrderId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(created);
      repository.create.mockResolvedValue(created);
      gateway.createPaymentLink
        .mockRejectedValueOnce(new Error('Stripe unavailable'))
        .mockResolvedValueOnce(link('cs_test_recovered'));

      await expect(generate.execute({ serviceOrderId })).rejects.toThrow(
        'Stripe unavailable',
      );
      expect(created.getStatus()).toBe(BillingStatus.PENDING);

      const recovered = await generate.execute({ serviceOrderId });

      expect(recovered.getStatus()).toBe(BillingStatus.WAITING_PAYMENT);
      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(repository.registerCheckoutSession.mock.calls).toEqual([
        [billingId, 'cs_test_recovered'],
      ]);
    });

    it('keeps the checkout session when persistence loses a race, so the webhook still settles it', async () => {
      const created = pendingBilling();
      acceptedBudgets.findAccepted.mockResolvedValue({
        id: budgetId,
        total: Money.fromCents(15000),
      });
      repository.findByServiceOrderId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(pendingBilling());
      repository.create.mockResolvedValue(created);
      repository.update
        .mockResolvedValueOnce(null)
        .mockImplementationOnce((billing: Billing) => Promise.resolve(billing));
      gateway.createPaymentLink
        .mockResolvedValueOnce(link('cs_test_first'))
        .mockResolvedValueOnce(link('cs_test_second'));

      await expect(generate.execute({ serviceOrderId })).rejects.toMatchObject({
        code: 'BILLING_CONCURRENT_UPDATE',
        message: 'A cobrança foi alterada por outra requisição',
      });

      const retried = await generate.execute({ serviceOrderId });

      expect(retried.getGatewayTransactionId()).toBe('cs_test_second');
      expect(repository.registerCheckoutSession.mock.calls).toEqual([
        [billingId, 'cs_test_first'],
        [billingId, 'cs_test_second'],
      ]);

      repository.findByGatewayTransactionId.mockResolvedValue(retried);
      gateway.parsePaymentWebhook.mockResolvedValue(
        confirmed('cs_test_first', new Date('2026-08-22T10:00:00.000Z')),
      );
      await webhook.execute(Buffer.from('{}'), 'stripe-signature');
      expect(retried.getStatus()).toBe(BillingStatus.PAID);
    });

    it.each([
      ['IN_PROGRESS', 'SERVICE_ORDER_NOT_COMPLETED'],
      ['DELIVERED', 'SERVICE_ORDER_NOT_COMPLETED'],
    ])('rejects billing when the service order is %s', async (status, code) => {
      serviceOrders.findById.mockResolvedValue(serviceOrder(status));

      await expect(generate.execute({ serviceOrderId })).rejects.toMatchObject({
        code,
        kind: 'CONFLICT',
      });
    });

    it('rejects billing for an unknown service order', async () => {
      serviceOrders.findById.mockResolvedValue(null);

      await expect(generate.execute({ serviceOrderId })).rejects.toMatchObject({
        code: 'SERVICE_ORDER_NOT_FOUND',
        message: 'Service order not found',
      });
    });

    it('rejects a second billing and a billing without accepted budget', async () => {
      repository.findByServiceOrderId.mockResolvedValueOnce(waitingBilling());
      await expect(generate.execute({ serviceOrderId })).rejects.toMatchObject({
        code: 'BILLING_ALREADY_EXISTS',
        message: 'Já existe cobrança para esta ordem de serviço',
      });

      repository.findByServiceOrderId.mockResolvedValueOnce(null);
      acceptedBudgets.findAccepted.mockResolvedValue(null);
      await expect(generate.execute({ serviceOrderId })).rejects.toMatchObject({
        code: 'NO_ACCEPTED_BUDGET',
        message: 'É preciso um orçamento aceito para gerar a cobrança',
      });
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('consultas, expiração e renovação', () => {
    it('finds by id, by service order and lists', async () => {
      const billing = waitingBilling();
      repository.findById.mockResolvedValue(billing);
      repository.findByServiceOrderId.mockResolvedValue(billing);
      repository.findAll.mockResolvedValue([billing]);

      await expect(find.execute(billingId)).resolves.toBe(billing);
      await expect(
        findByServiceOrder.execute(` ${serviceOrderId} `),
      ).resolves.toBe(billing);
      expect(repository.findByServiceOrderId).toHaveBeenCalledWith(
        serviceOrderId,
      );
      await expect(list.execute()).resolves.toEqual([billing]);
    });

    it('answers BILLING_NOT_FOUND for unknown ids', async () => {
      repository.findById.mockResolvedValue(null);
      repository.findByServiceOrderId.mockResolvedValue(null);

      await expect(find.execute('missing')).rejects.toMatchObject({
        code: 'BILLING_NOT_FOUND',
        message: 'Cobrança não encontrada',
      });
      await expect(findByServiceOrder.execute('missing')).rejects.toMatchObject(
        {
          code: 'BILLING_NOT_FOUND',
        },
      );
    });

    it('expires a billing payment link', async () => {
      repository.findById.mockResolvedValue(
        waitingBilling({ expiresAt: new Date('2026-08-21T10:00:00.000Z') }),
      );

      const expired = await expire.execute(billingId);

      expect(expired.getStatus()).toBe(BillingStatus.EXPIRED);
    });

    it('rejects an expiration that lost the compare-and-set', async () => {
      repository.findById.mockResolvedValue(
        waitingBilling({ expiresAt: new Date('2026-08-21T10:00:00.000Z') }),
      );
      repository.update.mockResolvedValue(null);

      await expect(expire.execute(billingId)).rejects.toMatchObject({
        code: 'BILLING_CONCURRENT_UPDATE',
      });
    });

    it('renews an overdue payment link charging the penalty amount', async () => {
      const updatedAt = new Date('2026-08-20T10:00:00.000Z');
      repository.findById.mockResolvedValue(
        waitingBilling({
          gatewayTransactionId: 'cs_test_old',
          expiresAt: new Date('2026-08-20T10:00:00.000Z'),
          updatedAt,
        }),
      );
      gateway.createPaymentLink.mockResolvedValue(link('cs_test_renewed'));

      const renewed = await renew.execute(
        billingId,
        new Date('2026-08-21T10:00:00.000Z'),
      );

      expect(renewed.getPaymentLink()).toContain('cs_test_renewed');
      expect(renewed.getAmount().valueInCents).toBe(15000);
      expect(gateway.createPaymentLink).toHaveBeenCalledWith(
        expect.objectContaining({ amountInCents: 15305 }),
      );
      expect(repository.update).toHaveBeenCalledWith(renewed, updatedAt);
      expect(repository.registerCheckoutSession).toHaveBeenCalledWith(
        billingId,
        'cs_test_renewed',
      );
    });

    it('rejects renewal before expiration and for a paid billing', async () => {
      repository.findById.mockResolvedValueOnce(
        waitingBilling({ expiresAt: new Date('2026-08-22T10:00:00.000Z') }),
      );
      await expect(
        renew.execute(billingId, new Date('2026-08-21T10:00:00.000Z')),
      ).rejects.toMatchObject({
        code: 'PAYMENT_LINK_NOT_EXPIRED',
        kind: 'INVALID',
        message: 'O link de pagamento da cobrança ainda não expirou',
      });

      repository.findById.mockResolvedValueOnce(
        waitingBilling({
          status: BillingStatus.PAID,
          paidAt: new Date('2026-08-20T10:00:00.000Z'),
          expiresAt: new Date('2026-08-19T10:00:00.000Z'),
        }),
      );
      await expect(
        renew.execute(billingId, new Date('2026-08-21T10:00:00.000Z')),
      ).rejects.toMatchObject({
        code: 'BILLING_PAID_IS_TERMINAL',
        message: 'Cobrança paga é terminal',
      });
      expect(gateway.createPaymentLink).not.toHaveBeenCalled();
    });
  });

  describe('webhook do gateway', () => {
    const paidAt = new Date('2026-08-22T10:00:00.000Z');

    it('settles the billing once even when the webhook is delivered twice', async () => {
      const billing = waitingBilling();
      repository.findByGatewayTransactionId.mockResolvedValue(billing);
      gateway.parsePaymentWebhook.mockResolvedValue(
        confirmed('cs_test_123', paidAt),
      );

      await webhook.execute(Buffer.from('{}'), 'stripe-signature');
      await webhook.execute(Buffer.from('{}'), 'stripe-signature');

      expect(billing.getStatus()).toBe(BillingStatus.PAID);
      expect(repository.update).toHaveBeenCalledTimes(1);
      expect(repository.recordCheckoutSessionPayment).toHaveBeenCalledTimes(2);
    });

    it('records a payment from a distinct known session after the billing is paid', async () => {
      repository.findByGatewayTransactionId.mockResolvedValue(
        waitingBilling({
          status: BillingStatus.PAID,
          gatewayTransactionId: 'cs_test_current',
          paymentMethod: PaymentMethod.CARD,
          paidAt,
        }),
      );
      const oldPaidAt = new Date('2026-08-22T10:01:00.000Z');
      gateway.parsePaymentWebhook.mockResolvedValue(
        confirmed('cs_test_old', oldPaidAt),
      );

      await webhook.execute(Buffer.from('{}'), 'stripe-signature');

      expect(repository.recordCheckoutSessionPayment).toHaveBeenCalledWith(
        'cs_test_old',
        PaymentMethod.CARD,
        oldPaidAt,
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('registers a payment from a session created before renewal', async () => {
      const billing = waitingBilling({
        gatewayTransactionId: 'cs_test_renewed',
      });
      repository.findByGatewayTransactionId.mockResolvedValue(billing);
      gateway.parsePaymentWebhook.mockResolvedValue(
        confirmed('cs_test_original', paidAt),
      );

      await webhook.execute(Buffer.from('{}'), 'stripe-signature');

      expect(billing.getStatus()).toBe(BillingStatus.PAID);
    });

    it('accepts concurrent duplicates when another request already stored the payment', async () => {
      const updatedAt = new Date('2026-08-22T09:00:00.000Z');
      const storedPaid = waitingBilling({
        status: BillingStatus.PAID,
        paymentMethod: PaymentMethod.CARD,
        paidAt,
        createdAt: updatedAt,
        updatedAt: paidAt,
      });
      repository.findByGatewayTransactionId
        .mockResolvedValueOnce(
          waitingBilling({ createdAt: updatedAt, updatedAt }),
        )
        .mockResolvedValueOnce(
          waitingBilling({ createdAt: updatedAt, updatedAt }),
        )
        .mockResolvedValueOnce(storedPaid);
      repository.update
        .mockImplementationOnce((billing: Billing) => Promise.resolve(billing))
        .mockResolvedValueOnce(null);
      gateway.parsePaymentWebhook.mockResolvedValue(
        confirmed('cs_test_123', paidAt),
      );

      await expect(
        Promise.all([
          webhook.execute(Buffer.from('{}'), 'stripe-signature'),
          webhook.execute(Buffer.from('{}'), 'stripe-signature'),
        ]),
      ).resolves.toEqual([undefined, undefined]);
      expect(repository.findByGatewayTransactionId).toHaveBeenCalledTimes(3);
    });

    it('is a conflict when the race was lost and nobody settled', async () => {
      repository.findByGatewayTransactionId
        .mockResolvedValueOnce(waitingBilling())
        .mockResolvedValueOnce(waitingBilling());
      repository.update.mockResolvedValue(null);
      gateway.parsePaymentWebhook.mockResolvedValue(
        confirmed('cs_test_123', paidAt),
      );

      await expect(
        webhook.execute(Buffer.from('{}'), 'stripe-signature'),
      ).rejects.toMatchObject({ code: 'BILLING_CONCURRENT_UPDATE' });
    });

    it('ignores events that are not a confirmed payment', async () => {
      gateway.parsePaymentWebhook.mockResolvedValue({
        type: 'ignored',
        reason: 'Unsupported Stripe event',
      });

      await webhook.execute(Buffer.from('{}'), 'stripe-signature');

      expect(repository.findByGatewayTransactionId).not.toHaveBeenCalled();
    });

    it('translates an invalid signature, propagates other gateway failures and 404s unknown sessions', async () => {
      gateway.parsePaymentWebhook.mockRejectedValueOnce(
        new InvalidPaymentWebhookSignatureError(),
      );
      await expect(
        webhook.execute(Buffer.from('{}'), 'invalid-signature'),
      ).rejects.toMatchObject({
        code: 'INVALID_WEBHOOK_SIGNATURE',
        kind: 'INVALID',
        message: 'Assinatura do webhook do Stripe inválida',
      });

      gateway.parsePaymentWebhook.mockRejectedValueOnce(new Error('boom'));
      await expect(
        webhook.execute(Buffer.from('{}'), 'stripe-signature'),
      ).rejects.toThrow('boom');

      gateway.parsePaymentWebhook.mockResolvedValue(
        confirmed('cs_test_123', paidAt),
      );
      repository.findByGatewayTransactionId.mockResolvedValue(null);
      await expect(
        webhook.execute(Buffer.from('{}'), 'stripe-signature'),
      ).rejects.toMatchObject({ code: 'BILLING_NOT_FOUND' });
    });
  });

  describe('retornos do checkout', () => {
    const sessionId = 'cs_test_return';
    const paidAt = new Date('2026-08-29T12:00:00.000Z');
    const returnBilling = () =>
      waitingBilling({
        gatewayTransactionId: sessionId,
        expiresAt: new Date('2026-08-30T10:00:00.000Z'),
      });

    it('settles and delivers when the gateway confirms the payment', async () => {
      repository.findByGatewayTransactionId.mockResolvedValue(returnBilling());
      gateway.getPaymentStatus.mockResolvedValue({
        status: 'paid',
        gatewayTransactionId: sessionId,
        method: PaymentMethod.CARD,
        paidAt,
      });
      serviceOrders.deliver.mockResolvedValue(serviceOrder('DELIVERED'));

      const result = await confirmReturn.execute(` ${sessionId} `);

      expect(result.billing.getStatus()).toBe(BillingStatus.PAID);
      expect(result.billing.getPaidAt()).toEqual(paidAt);
      expect(result.serviceOrder.status).toBe('DELIVERED');
      expect(serviceOrders.deliver).toHaveBeenCalledWith(serviceOrderId);
    });

    it('moves nothing when the gateway does not confirm the payment', async () => {
      repository.findByGatewayTransactionId.mockResolvedValue(returnBilling());
      gateway.getPaymentStatus.mockResolvedValue({
        status: 'unpaid',
        gatewayTransactionId: sessionId,
      });

      const result = await confirmReturn.execute(sessionId);

      expect(result.billing.getStatus()).toBe(BillingStatus.WAITING_PAYMENT);
      expect(result.serviceOrder.status).toBe('COMPLETED');
      expect(repository.update).not.toHaveBeenCalled();
      expect(serviceOrders.deliver).not.toHaveBeenCalled();
    });

    it('does not deliver again when the webhook already delivered', async () => {
      repository.findByGatewayTransactionId.mockResolvedValue(
        waitingBilling({
          status: BillingStatus.PAID,
          gatewayTransactionId: sessionId,
          paidAt: new Date('2026-08-29T11:00:00.000Z'),
        }),
      );
      gateway.getPaymentStatus.mockResolvedValue({
        status: 'paid',
        gatewayTransactionId: sessionId,
        method: PaymentMethod.CARD,
        paidAt,
      });
      serviceOrders.findById.mockResolvedValue(serviceOrder('DELIVERED'));

      const result = await confirmReturn.execute(sessionId);

      expect(result.serviceOrder.status).toBe('DELIVERED');
      expect(serviceOrders.deliver).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('rejects a blank or unknown session', async () => {
      await expect(confirmReturn.execute('  ')).rejects.toMatchObject({
        code: 'CHECKOUT_SESSION_REQUIRED',
        kind: 'INVALID',
      });

      repository.findByGatewayTransactionId.mockResolvedValue(null);
      await expect(confirmReturn.execute(sessionId)).rejects.toMatchObject({
        code: 'BILLING_NOT_FOUND',
      });
      expect(gateway.getPaymentStatus).not.toHaveBeenCalled();
    });

    it('leaves the service order awaiting payment when the customer abandons the checkout', async () => {
      repository.findById.mockResolvedValue(returnBilling());
      gateway.getPaymentStatus.mockResolvedValue({
        status: 'unpaid',
        gatewayTransactionId: sessionId,
      });
      serviceOrders.awaitPayment.mockResolvedValue(
        serviceOrder('AWAITING_PAYMENT'),
      );

      const result = await cancelReturn.execute(billingId);

      expect(result.serviceOrder.status).toBe('AWAITING_PAYMENT');
      expect(result.billing.getStatus()).toBe(BillingStatus.WAITING_PAYMENT);
      expect(serviceOrders.awaitPayment).toHaveBeenCalledWith(serviceOrderId);
    });

    it('does not downgrade the service order when the gateway already has the payment', async () => {
      repository.findById.mockResolvedValue(returnBilling());
      gateway.getPaymentStatus.mockResolvedValue({
        status: 'paid',
        gatewayTransactionId: sessionId,
        method: PaymentMethod.CARD,
        paidAt,
      });
      serviceOrders.deliver.mockResolvedValue(serviceOrder('DELIVERED'));

      const result = await cancelReturn.execute(billingId);

      expect(result.billing.getStatus()).toBe(BillingStatus.PAID);
      expect(result.serviceOrder.status).toBe('DELIVERED');
      expect(serviceOrders.awaitPayment).not.toHaveBeenCalled();
    });

    it('is idempotent: a second cancellation does not transition again', async () => {
      repository.findById.mockResolvedValue(returnBilling());
      gateway.getPaymentStatus.mockResolvedValue({
        status: 'unpaid',
        gatewayTransactionId: sessionId,
      });
      serviceOrders.findById.mockResolvedValue(
        serviceOrder('AWAITING_PAYMENT'),
      );

      const result = await cancelReturn.execute(billingId);

      expect(result.serviceOrder.status).toBe('AWAITING_PAYMENT');
      expect(serviceOrders.awaitPayment).not.toHaveBeenCalled();
    });

    it('answers the stored state for a paid billing and for one without session', async () => {
      repository.findById.mockResolvedValueOnce(
        waitingBilling({
          status: BillingStatus.PAID,
          gatewayTransactionId: sessionId,
          paidAt,
        }),
      );
      serviceOrders.findById.mockResolvedValue(serviceOrder('DELIVERED'));
      const paid = await cancelReturn.execute(billingId);
      expect(paid.serviceOrder.status).toBe('DELIVERED');
      expect(gateway.getPaymentStatus).not.toHaveBeenCalled();

      repository.findById.mockResolvedValueOnce(pendingBilling());
      serviceOrders.findById.mockResolvedValue(serviceOrder('COMPLETED'));
      serviceOrders.awaitPayment.mockResolvedValue(
        serviceOrder('AWAITING_PAYMENT'),
      );
      const pending = await cancelReturn.execute(billingId);
      expect(pending.serviceOrder.status).toBe('AWAITING_PAYMENT');
      expect(gateway.getPaymentStatus).not.toHaveBeenCalled();
    });
  });

  describe('entrega manual', () => {
    it('delivers only a paid billing', async () => {
      repository.findById.mockResolvedValueOnce(waitingBilling());
      await expect(deliver.execute(billingId)).rejects.toMatchObject({
        code: 'BILLING_NOT_PAID',
        message: 'A cobrança precisa estar paga para entregar a OS',
      });

      repository.findById.mockResolvedValueOnce(
        waitingBilling({
          status: BillingStatus.PAID,
          paidAt: new Date('2026-08-22T10:00:00.000Z'),
        }),
      );
      serviceOrders.deliver.mockResolvedValue(serviceOrder('DELIVERED'));
      await deliver.execute(billingId);
      expect(serviceOrders.deliver).toHaveBeenCalledWith(serviceOrderId);
    });
  });
});

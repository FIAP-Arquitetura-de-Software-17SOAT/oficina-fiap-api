import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Money } from '../../../shared/domain/value-objects/money.vo';
import {
  Budget,
  BudgetItemType,
  BudgetStatus,
} from '../../budget/entities/budget.entity';
import { BudgetService } from '../../budget/services/budget.service';
import { Client } from '../../client/entities/client.entity';
import { ClientRepository } from '../../client/repositories/client.repository';
import { NotificationType } from '../../notification/enums/notification-type.enum';
import { NotificationService } from '../../notification/services/notification.service';
import { ServiceOrder } from '../../service-order/entities/service-order.entity';
import { ServiceOrderStatus } from '../../service-order/enums/service-order-status.enum';
import { ServiceOrderService } from '../../service-order/services/service-order.service';
import { Billing } from '../entities/billing.entity';
import { BillingStatus } from '../enums/billing-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import {
  InvalidPaymentWebhookSignatureError,
  PaymentGateway,
} from '../gateways/payment-gateway';
import { BillingRepository } from '../repositories/billing.repository';
import { BillingService } from './billing.service';

const serviceOrderId = 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c';
const budgetId = 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

const completedServiceOrder = () =>
  ServiceOrder.restore(serviceOrderId, {
    clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    description: 'Oil change',
    status: ServiceOrderStatus.COMPLETED,
    completedAt: new Date('2026-08-20T10:00:00.000Z'),
  });

const acceptedBudget = (version: number, total: number) =>
  Budget.restore(budgetId, {
    serviceOrderId,
    version,
    status: BudgetStatus.ACCEPTED,
    items: [
      {
        id: '10000000-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        description: 'Service',
        type: BudgetItemType.SERVICE,
        quantity: 1,
        unitPrice: Money.fromDecimal(total),
      },
    ],
  });

describe('BillingService', () => {
  let repository: jest.Mocked<BillingRepository>;
  let budgetService: jest.Mocked<BudgetService>;
  let clientRepository: jest.Mocked<ClientRepository>;
  let notifications: jest.Mocked<NotificationService>;
  let serviceOrderService: jest.Mocked<ServiceOrderService>;
  let paymentGateway: jest.Mocked<PaymentGateway>;
  let service: BillingService;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByServiceOrderId: jest.fn(),
      findByGatewayTransactionId: jest.fn(),
      findAll: jest.fn(),
      registerCheckoutSession: jest.fn(),
      recordCheckoutSessionPayment: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<BillingRepository>;
    budgetService = {
      findByServiceOrderId: jest.fn(),
    } as unknown as jest.Mocked<BudgetService>;
    clientRepository = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<ClientRepository>;
    notifications = {
      enqueue: jest.fn(),
    } as unknown as jest.Mocked<NotificationService>;
    serviceOrderService = {
      findById: jest.fn(),
      deliver: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderService>;
    paymentGateway = {
      createPaymentLink: jest.fn(),
      parsePaymentWebhook: jest.fn(),
    };
    service = new BillingService(
      repository,
      budgetService,
      serviceOrderService,
      paymentGateway,
      clientRepository,
      notifications,
    );
  });

  it('generates billing and stores Stripe payment link', async () => {
    const createdAt = new Date('2026-08-22T09:00:00.000Z');
    const created = Billing.restore('bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(15000),
      createdAt,
      updatedAt: createdAt,
    });
    serviceOrderService.findById.mockResolvedValue(completedServiceOrder());
    budgetService.findByServiceOrderId.mockResolvedValue([
      acceptedBudget(1, 100),
      acceptedBudget(2, 150),
    ]);
    repository.findByServiceOrderId.mockResolvedValue(null);
    repository.create.mockResolvedValue(created);
    repository.update.mockImplementation((billing) => Promise.resolve(billing));
    paymentGateway.createPaymentLink.mockResolvedValue({
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
      gatewayTransactionId: 'cs_test_123',
      expiresAt: new Date('2026-08-23T10:00:00.000Z'),
    });

    const billing = await service.generateForServiceOrder({ serviceOrderId });

    expect(billing.getStatus()).toBe(BillingStatus.WAITING_PAYMENT);
    expect(billing.getPaymentLink()).toBe(
      'https://checkout.stripe.com/c/pay/cs_test_123',
    );
    expect(paymentGateway.createPaymentLink.mock.calls).toEqual([
      [
        {
          billingId: billing.getId(),
          serviceOrderId,
          amountInCents: 15000,
          idempotencyKey: expect.stringMatching(
            new RegExp(`^billing-payment-link:${billing.getId()}:`),
          ),
        },
      ],
    ]);
    expect(repository.update.mock.calls).toEqual([[billing, createdAt]]);
    expect(repository.registerCheckoutSession.mock.calls).toEqual([
      [billing.getId(), 'cs_test_123'],
    ]);
  });

  it('queues the persisted payment link for the service-order customer', async () => {
    const createdAt = new Date('2026-08-22T09:00:00.000Z');
    const billing = Billing.restore('bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(15000),
      createdAt,
      updatedAt: createdAt,
    });
    const client = Client.create({
      name: 'Maria Silva',
      document: '529.982.247-25',
      email: 'maria@example.com',
      phone: '(11) 99999-8888',
    });
    const paymentLink = 'https://checkout.stripe.com/c/pay/cs_test_456';

    serviceOrderService.findById.mockResolvedValue(completedServiceOrder());
    repository.findByServiceOrderId.mockResolvedValue(billing);
    repository.update.mockImplementation((updated) => Promise.resolve(updated));
    paymentGateway.createPaymentLink.mockResolvedValue({
      paymentLink,
      gatewayTransactionId: 'cs_test_456',
      expiresAt: new Date('2026-08-23T10:00:00.000Z'),
    });
    clientRepository.findById.mockResolvedValue(client);

    await service.generateForServiceOrder({ serviceOrderId });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.PAYMENT_LINK_READY,
        to: client.getEmail().getValue(),
        text: expect.stringContaining(paymentLink),
        html: expect.stringContaining(paymentLink),
      }),
    );
    const message = notifications.enqueue.mock.calls[0][0];
    expect(message.text).toContain('R$ 150,00');
    expect(message.html).toContain('R$ 150,00');
  });

  it('retries payment link generation for a pending billing', async () => {
    const updatedAt = new Date('2026-08-22T09:00:00.000Z');
    const pendingBilling = Billing.restore(
      'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      {
        serviceOrderId,
        budgetId,
        amount: Money.fromCents(15000),
        createdAt: updatedAt,
        updatedAt,
      },
    );
    serviceOrderService.findById.mockResolvedValue(completedServiceOrder());
    repository.findByServiceOrderId.mockResolvedValue(pendingBilling);
    repository.update.mockImplementation((billing) => Promise.resolve(billing));
    paymentGateway.createPaymentLink.mockResolvedValue({
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_retry',
      gatewayTransactionId: 'cs_test_retry',
      expiresAt: new Date('2026-08-23T10:00:00.000Z'),
    });

    const billing = await service.generateForServiceOrder({ serviceOrderId });

    expect(billing.getStatus()).toBe(BillingStatus.WAITING_PAYMENT);
    expect(billing.getPaymentLink()).toBe(
      'https://checkout.stripe.com/c/pay/cs_test_retry',
    );
    expect(repository.create.mock.calls).toHaveLength(0);
    expect(repository.update.mock.calls).toEqual([[billing, updatedAt]]);
    expect(repository.registerCheckoutSession.mock.calls).toEqual([
      [billing.getId(), 'cs_test_retry'],
    ]);
  });

  it('recovers a pending billing after gateway link creation fails', async () => {
    const createdAt = new Date('2026-08-22T09:00:00.000Z');
    const created = Billing.restore('bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(15000),
      createdAt,
      updatedAt: createdAt,
    });
    serviceOrderService.findById.mockResolvedValue(completedServiceOrder());
    budgetService.findByServiceOrderId.mockResolvedValue([
      acceptedBudget(1, 150),
    ]);
    repository.findByServiceOrderId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(created);
    repository.create.mockResolvedValue(created);
    repository.update.mockImplementation((billing) => Promise.resolve(billing));
    paymentGateway.createPaymentLink
      .mockRejectedValueOnce(new Error('Stripe unavailable'))
      .mockResolvedValueOnce({
        paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_recovered',
        gatewayTransactionId: 'cs_test_recovered',
        expiresAt: new Date('2026-08-23T10:00:00.000Z'),
      });

    await expect(
      service.generateForServiceOrder({ serviceOrderId }),
    ).rejects.toThrow('Stripe unavailable');
    expect(created.getStatus()).toBe(BillingStatus.PENDING);

    const recovered = await service.generateForServiceOrder({ serviceOrderId });

    expect(recovered.getStatus()).toBe(BillingStatus.WAITING_PAYMENT);
    expect(recovered.getPaymentLink()).toBe(
      'https://checkout.stripe.com/c/pay/cs_test_recovered',
    );
    expect(repository.create.mock.calls).toHaveLength(1);
    expect(repository.update.mock.calls).toEqual([[recovered, createdAt]]);
    expect(repository.registerCheckoutSession.mock.calls).toEqual([
      [recovered.getId(), 'cs_test_recovered'],
    ]);
  });

  it('retries the same persisted billing after Stripe succeeds but persistence loses a race', async () => {
    const updatedAt = new Date('2026-08-22T09:00:00.000Z');
    const created = Billing.restore('bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(15000),
      createdAt: updatedAt,
      updatedAt,
    });
    const persistedPending = Billing.restore(created.getId(), {
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(15000),
      createdAt: updatedAt,
      updatedAt,
    });
    serviceOrderService.findById.mockResolvedValue(completedServiceOrder());
    budgetService.findByServiceOrderId.mockResolvedValue([
      acceptedBudget(1, 150),
    ]);
    repository.findByServiceOrderId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(persistedPending);
    repository.create.mockResolvedValue(created);
    repository.update
      .mockResolvedValueOnce(null)
      .mockImplementationOnce((billing) => Promise.resolve(billing));
    paymentGateway.createPaymentLink
      .mockResolvedValueOnce({
        paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_first',
        gatewayTransactionId: 'cs_test_first',
        expiresAt: new Date('2026-08-23T10:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_second',
        gatewayTransactionId: 'cs_test_second',
        expiresAt: new Date('2026-08-23T10:00:00.000Z'),
      });

    await expect(
      service.generateForServiceOrder({ serviceOrderId }),
    ).rejects.toThrow('A cobrança foi alterada por outra requisição');

    const retried = await service.generateForServiceOrder({ serviceOrderId });

    expect(retried.getStatus()).toBe(BillingStatus.WAITING_PAYMENT);
    expect(retried.getGatewayTransactionId()).toBe('cs_test_second');
    expect(repository.create.mock.calls).toHaveLength(1);
    expect(paymentGateway.createPaymentLink.mock.calls).toHaveLength(2);
    expect(repository.registerCheckoutSession.mock.calls).toEqual([
      [created.getId(), 'cs_test_first'],
      [created.getId(), 'cs_test_second'],
    ]);

    repository.findByGatewayTransactionId.mockResolvedValue(retried);
    paymentGateway.parsePaymentWebhook.mockResolvedValue({
      type: 'payment_confirmed',
      gatewayTransactionId: 'cs_test_first',
      method: PaymentMethod.CARD,
      paidAt: new Date('2026-08-22T10:00:00.000Z'),
    });

    await expect(
      service.handlePaymentWebhook(Buffer.from('{}'), 'stripe-signature'),
    ).resolves.toBeUndefined();
    expect(retried.getStatus()).toBe(BillingStatus.PAID);
  });

  it('handles duplicated Stripe webhook idempotently', async () => {
    const billing = Billing.restore('bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(15000),
      status: BillingStatus.WAITING_PAYMENT,
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
      gatewayTransactionId: 'cs_test_123',
    });
    repository.findByGatewayTransactionId.mockResolvedValue(billing);
    repository.update.mockImplementation((updated) => Promise.resolve(updated));
    paymentGateway.parsePaymentWebhook.mockResolvedValue({
      type: 'payment_confirmed',
      gatewayTransactionId: 'cs_test_123',
      method: PaymentMethod.CARD,
      paidAt: new Date('2026-08-22T10:00:00.000Z'),
    });

    await service.handlePaymentWebhook(Buffer.from('{}'), 'stripe-signature');
    await service.handlePaymentWebhook(Buffer.from('{}'), 'stripe-signature');

    expect(repository.update.mock.calls).toHaveLength(1);
  });

  it('records payment from a distinct known Checkout Session after billing is paid', async () => {
    const billing = Billing.restore('bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(15000),
      status: BillingStatus.PAID,
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_current',
      gatewayTransactionId: 'cs_test_current',
      paymentMethod: PaymentMethod.CARD,
      paidAt: new Date('2026-08-22T10:00:00.000Z'),
    });
    const oldSessionPaidAt = new Date('2026-08-22T10:01:00.000Z');
    repository.findByGatewayTransactionId.mockResolvedValue(billing);
    paymentGateway.parsePaymentWebhook.mockResolvedValue({
      type: 'payment_confirmed',
      gatewayTransactionId: 'cs_test_old',
      method: PaymentMethod.CARD,
      paidAt: oldSessionPaidAt,
    });

    await expect(
      service.handlePaymentWebhook(Buffer.from('{}'), 'stripe-signature'),
    ).resolves.toBeUndefined();

    expect(repository.recordCheckoutSessionPayment.mock.calls).toEqual([
      ['cs_test_old', PaymentMethod.CARD, oldSessionPaidAt],
    ]);
    expect(repository.update.mock.calls).toHaveLength(0);
  });

  it('accepts concurrent duplicate webhooks when another request already stored the payment', async () => {
    const updatedAt = new Date('2026-08-22T09:00:00.000Z');
    const waitingBilling = () =>
      Billing.restore('bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
        serviceOrderId,
        budgetId,
        amount: Money.fromCents(15000),
        status: BillingStatus.WAITING_PAYMENT,
        paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
        gatewayTransactionId: 'cs_test_123',
        createdAt: updatedAt,
        updatedAt,
      });
    const firstRead = waitingBilling();
    const staleSecondRead = waitingBilling();
    const storedPaid = Billing.restore(firstRead.getId(), {
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(15000),
      status: BillingStatus.PAID,
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
      gatewayTransactionId: 'cs_test_123',
      paymentMethod: PaymentMethod.CARD,
      paidAt: new Date('2026-08-22T10:00:00.000Z'),
      createdAt: updatedAt,
      updatedAt: new Date('2026-08-22T10:00:00.000Z'),
    });
    repository.findByGatewayTransactionId
      .mockResolvedValueOnce(firstRead)
      .mockResolvedValueOnce(staleSecondRead)
      .mockResolvedValueOnce(storedPaid);
    repository.update
      .mockImplementationOnce((billing) => Promise.resolve(billing))
      .mockResolvedValueOnce(null);
    paymentGateway.parsePaymentWebhook.mockResolvedValue({
      type: 'payment_confirmed',
      gatewayTransactionId: 'cs_test_123',
      method: PaymentMethod.CARD,
      paidAt: new Date('2026-08-22T10:00:00.000Z'),
    });

    await expect(
      Promise.all([
        service.handlePaymentWebhook(Buffer.from('{}'), 'stripe-signature'),
        service.handlePaymentWebhook(Buffer.from('{}'), 'stripe-signature'),
      ]),
    ).resolves.toEqual([undefined, undefined]);

    expect(repository.update.mock.calls).toHaveLength(2);
    expect(repository.findByGatewayTransactionId.mock.calls).toHaveLength(3);
  });

  it('translates an invalid Stripe webhook signature to bad request', async () => {
    paymentGateway.parsePaymentWebhook.mockRejectedValue(
      new InvalidPaymentWebhookSignatureError(),
    );

    await expect(
      service.handlePaymentWebhook(Buffer.from('{}'), 'invalid-signature'),
    ).rejects.toThrow(BadRequestException);
  });

  it('expires a billing payment link', async () => {
    const billing = Billing.restore('bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(15000),
      status: BillingStatus.WAITING_PAYMENT,
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
      gatewayTransactionId: 'cs_test_123',
      expiresAt: new Date('2026-08-21T10:00:00.000Z'),
    });
    repository.findById.mockResolvedValue(billing);
    repository.update.mockImplementation((updated) => Promise.resolve(updated));

    const expired = await service.expire(billing.getId());

    expect(expired.getStatus()).toBe(BillingStatus.EXPIRED);
  });

  it('renews an overdue payment link with penalty amount', async () => {
    const updatedAt = new Date('2026-08-20T10:00:00.000Z');
    const billing = Billing.restore('bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(15000),
      status: BillingStatus.WAITING_PAYMENT,
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_old',
      gatewayTransactionId: 'cs_test_old',
      expiresAt: new Date('2026-08-20T10:00:00.000Z'),
      updatedAt,
    });
    repository.findById.mockResolvedValue(billing);
    repository.update.mockImplementation((updated) => Promise.resolve(updated));
    paymentGateway.createPaymentLink.mockResolvedValue({
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_renewed',
      gatewayTransactionId: 'cs_test_renewed',
      expiresAt: new Date('2026-08-22T10:00:00.000Z'),
    });

    const renewed = await service.renewPaymentLink(
      billing.getId(),
      new Date('2026-08-21T10:00:00.000Z'),
    );

    expect(renewed.getStatus()).toBe(BillingStatus.WAITING_PAYMENT);
    expect(renewed.getPaymentLink()).toBe(
      'https://checkout.stripe.com/c/pay/cs_test_renewed',
    );
    expect(renewed.getAmount().valueInCents).toBe(15000);
    expect(paymentGateway.createPaymentLink.mock.calls).toEqual([
      [
        {
          billingId: billing.getId(),
          serviceOrderId,
          amountInCents: 15305,
          idempotencyKey: expect.stringMatching(
            new RegExp(`^billing-payment-link:${billing.getId()}:`),
          ),
        },
      ],
    ]);
    expect(repository.update.mock.calls).toEqual([[renewed, updatedAt]]);
    expect(repository.registerCheckoutSession.mock.calls).toEqual([
      [renewed.getId(), 'cs_test_renewed'],
    ]);
  });

  it('rejects payment link renewal before expiration', async () => {
    const billing = Billing.restore('bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(15000),
      status: BillingStatus.WAITING_PAYMENT,
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
      gatewayTransactionId: 'cs_test_123',
      expiresAt: new Date('2026-08-22T10:00:00.000Z'),
    });
    repository.findById.mockResolvedValue(billing);

    await expect(
      service.renewPaymentLink(
        billing.getId(),
        new Date('2026-08-21T10:00:00.000Z'),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(paymentGateway.createPaymentLink.mock.calls).toHaveLength(0);
  });

  it('rejects payment link renewal for paid billing', async () => {
    const billing = Billing.restore('bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(15000),
      status: BillingStatus.PAID,
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
      gatewayTransactionId: 'cs_test_123',
      paidAt: new Date('2026-08-20T10:00:00.000Z'),
      expiresAt: new Date('2026-08-19T10:00:00.000Z'),
    });
    repository.findById.mockResolvedValue(billing);

    await expect(
      service.renewPaymentLink(
        billing.getId(),
        new Date('2026-08-21T10:00:00.000Z'),
      ),
    ).rejects.toThrow(ConflictException);
    expect(paymentGateway.createPaymentLink.mock.calls).toHaveLength(0);
  });

  it('throws not found when a confirmed payment does not match billing', async () => {
    paymentGateway.parsePaymentWebhook.mockResolvedValue({
      type: 'payment_confirmed',
      gatewayTransactionId: 'cs_test_123',
      method: PaymentMethod.CARD,
      paidAt: new Date('2026-08-22T10:00:00.000Z'),
    });
    repository.findByGatewayTransactionId.mockResolvedValue(null);

    await expect(
      service.handlePaymentWebhook(Buffer.from('{}'), 'stripe-signature'),
    ).rejects.toThrow(NotFoundException);
  });

  it('registers a payment from a checkout session created before renewal', async () => {
    const billing = Billing.restore('bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c', {
      serviceOrderId,
      budgetId,
      amount: Money.fromCents(15000),
      status: BillingStatus.WAITING_PAYMENT,
      paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_renewed',
      gatewayTransactionId: 'cs_test_renewed',
    });
    repository.findByGatewayTransactionId.mockResolvedValue(billing);
    repository.update.mockImplementation((updated) => Promise.resolve(updated));
    paymentGateway.parsePaymentWebhook.mockResolvedValue({
      type: 'payment_confirmed',
      gatewayTransactionId: 'cs_test_original',
      method: PaymentMethod.CARD,
      paidAt: new Date('2026-08-22T10:00:00.000Z'),
    });

    await expect(
      service.handlePaymentWebhook(Buffer.from('{}'), 'stripe-signature'),
    ).resolves.toBeUndefined();
    expect(billing.getStatus()).toBe(BillingStatus.PAID);
  });

  it('rejects billing generation when service order is not completed', async () => {
    serviceOrderService.findById.mockResolvedValue(
      ServiceOrder.restore(serviceOrderId, {
        clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        description: 'Oil change',
        status: ServiceOrderStatus.IN_PROGRESS,
      }),
    );

    await expect(
      service.generateForServiceOrder({ serviceOrderId }),
    ).rejects.toThrow(ConflictException);
  });
});

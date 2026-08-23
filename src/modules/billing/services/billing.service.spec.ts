import { ConflictException, NotFoundException } from '@nestjs/common';
import { Money } from '../../../shared/domain/value-objects/money.vo';
import {
  Budget,
  BudgetItemType,
  BudgetStatus,
} from '../../budget/entities/budget.entity';
import { BudgetService } from '../../budget/services/budget.service';
import { ServiceOrder } from '../../service-order/entities/service-order.entity';
import { ServiceOrderStatus } from '../../service-order/enums/service-order-status.enum';
import { ServiceOrderService } from '../../service-order/services/service-order.service';
import { Billing } from '../entities/billing.entity';
import { BillingStatus } from '../enums/billing-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentGateway } from '../gateways/payment-gateway';
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
        unitPrice: total,
      },
    ],
  });

describe('BillingService', () => {
  let repository: jest.Mocked<BillingRepository>;
  let budgetService: jest.Mocked<BudgetService>;
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
      update: jest.fn(),
    } as unknown as jest.Mocked<BillingRepository>;
    budgetService = {
      findByServiceOrderId: jest.fn(),
    } as unknown as jest.Mocked<BudgetService>;
    serviceOrderService = {
      findById: jest.fn(),
      deliver: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderService>;
    paymentGateway = {
      createPaymentLink: jest.fn(),
      parsePaymentWebhook: jest.fn(),
    } as unknown as jest.Mocked<PaymentGateway>;
    service = new BillingService(
      repository,
      budgetService,
      serviceOrderService,
      paymentGateway,
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
    repository.update.mockImplementation(async (billing) => billing);
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
    expect(paymentGateway.createPaymentLink).toHaveBeenCalledWith({
      billingId: billing.getId(),
      serviceOrderId,
      amountInCents: 15000,
    });
    expect(repository.update).toHaveBeenCalledWith(billing, createdAt);
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
    repository.update.mockImplementation(async (billing) => billing);
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
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalledWith(billing, updatedAt);
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
    budgetService.findByServiceOrderId.mockResolvedValue([acceptedBudget(1, 150)]);
    repository.findByServiceOrderId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(created);
    repository.create.mockResolvedValue(created);
    repository.update.mockImplementation(async (billing) => billing);
    paymentGateway.createPaymentLink
      .mockRejectedValueOnce(new Error('Stripe unavailable'))
      .mockResolvedValueOnce({
        paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_recovered',
        gatewayTransactionId: 'cs_test_recovered',
        expiresAt: new Date('2026-08-23T10:00:00.000Z'),
      });

    await expect(service.generateForServiceOrder({ serviceOrderId })).rejects.toThrow(
      'Stripe unavailable',
    );
    expect(created.getStatus()).toBe(BillingStatus.PENDING);

    const recovered = await service.generateForServiceOrder({ serviceOrderId });

    expect(recovered.getStatus()).toBe(BillingStatus.WAITING_PAYMENT);
    expect(recovered.getPaymentLink()).toBe(
      'https://checkout.stripe.com/c/pay/cs_test_recovered',
    );
    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.update).toHaveBeenCalledWith(recovered, createdAt);
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
    repository.update.mockImplementation(async (updated) => updated);
    paymentGateway.parsePaymentWebhook.mockResolvedValue({
      type: 'payment_confirmed',
      gatewayTransactionId: 'cs_test_123',
      method: PaymentMethod.CARD,
      paidAt: new Date('2026-08-22T10:00:00.000Z'),
    });

    await service.handlePaymentWebhook(Buffer.from('{}'), 'stripe-signature');
    await service.handlePaymentWebhook(Buffer.from('{}'), 'stripe-signature');

    expect(repository.update).toHaveBeenCalledTimes(1);
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
    repository.update.mockImplementation(async (updated) => updated);

    const expired = await service.expire(billing.getId());

    expect(expired.getStatus()).toBe(BillingStatus.EXPIRED);
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

  it('rejects billing generation when service order is not completed', async () => {
    serviceOrderService.findById.mockResolvedValue(
      ServiceOrder.restore(serviceOrderId, {
        clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        description: 'Oil change',
        status: ServiceOrderStatus.IN_PROGRESS,
      }),
    );

    await expect(service.generateForServiceOrder({ serviceOrderId })).rejects.toThrow(
      ConflictException,
    );
  });
});

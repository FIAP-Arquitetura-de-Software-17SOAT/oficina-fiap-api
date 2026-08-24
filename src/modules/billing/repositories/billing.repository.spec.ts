import { PrismaService } from '../../../shared/database/prisma.service';
import { Money } from '../../../shared/domain/value-objects/money.vo';
import { Billing } from '../entities/billing.entity';
import { BillingStatus } from '../enums/billing-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import { BillingRepository } from './billing.repository';

const generatedAt = new Date('2026-08-22T10:00:00.000Z');
const expiresAt = new Date('2026-08-23T10:00:00.000Z');
const row = {
  id: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
  serviceOrderId: 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
  budgetId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
  status: BillingStatus.WAITING_PAYMENT,
  amountCents: 12000,
  paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_123',
  gatewayTransactionId: 'cs_test_123',
  paymentMethod: null,
  generatedAt,
  paidAt: null,
  expiresAt,
  createdAt: generatedAt,
  updatedAt: generatedAt,
};

describe('BillingRepository', () => {
  let prisma: {
    billing: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
    };
    billingCheckoutSession: {
      findUnique: jest.Mock;
      create: jest.Mock;
      upsert: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let repository: BillingRepository;

  beforeEach(() => {
    prisma = {
      billing: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      billingCheckoutSession: {
        findUnique: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    repository = new BillingRepository(prisma as unknown as PrismaService);
  });

  it('creates a gateway-backed billing without payment rows', async () => {
    prisma.billing.create.mockResolvedValue(row);
    const billing = Billing.restore(row.id, {
      serviceOrderId: row.serviceOrderId,
      budgetId: row.budgetId,
      amount: Money.fromCents(row.amountCents),
      status: BillingStatus.WAITING_PAYMENT,
      paymentLink: row.paymentLink,
      gatewayTransactionId: row.gatewayTransactionId,
      expiresAt: row.expiresAt,
      generatedAt: row.generatedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });

    await repository.create(billing);

    expect(prisma.billing.create).toHaveBeenCalledWith({
      data: {
        id: row.id,
        serviceOrderId: row.serviceOrderId,
        budgetId: row.budgetId,
        status: BillingStatus.WAITING_PAYMENT,
        amountCents: row.amountCents,
        paymentLink: row.paymentLink,
        gatewayTransactionId: row.gatewayTransactionId,
        paymentMethod: null,
        generatedAt,
        paidAt: null,
        expiresAt,
        createdAt: generatedAt,
        updatedAt: generatedAt,
      },
    });
  });

  it('finds billing by service order id without loading payment rows', async () => {
    prisma.billing.findUnique.mockResolvedValue(row);

    const billing = await repository.findByServiceOrderId(row.serviceOrderId);

    expect(prisma.billing.findUnique).toHaveBeenCalledWith({
      where: { serviceOrderId: row.serviceOrderId },
    });
    expect(billing?.getGatewayTransactionId()).toBe(row.gatewayTransactionId);
  });

  it('finds billing by gateway transaction id for payment webhooks', async () => {
    prisma.billingCheckoutSession.findUnique.mockResolvedValue({
      billing: row,
    });

    const billing = await repository.findByGatewayTransactionId(
      row.gatewayTransactionId,
    );

    expect(prisma.billingCheckoutSession.findUnique).toHaveBeenCalledWith({
      where: { gatewayTransactionId: row.gatewayTransactionId },
      include: { billing: true },
    });
    expect(billing?.getId()).toBe(row.id);
  });

  it('registers checkout sessions before billing state changes', async () => {
    prisma.billingCheckoutSession.upsert.mockResolvedValue({});

    await repository.registerCheckoutSession(row.id, row.gatewayTransactionId);

    expect(prisma.billingCheckoutSession.upsert).toHaveBeenCalledWith({
      where: { gatewayTransactionId: row.gatewayTransactionId },
      update: {},
      create: {
        billingId: row.id,
        gatewayTransactionId: row.gatewayTransactionId,
      },
    });
  });

  it('records each checkout session payment only once', async () => {
    prisma.billingCheckoutSession.updateMany.mockResolvedValue({ count: 1 });

    await repository.recordCheckoutSessionPayment(
      row.gatewayTransactionId,
      PaymentMethod.CARD,
      generatedAt,
    );

    expect(prisma.billingCheckoutSession.updateMany).toHaveBeenCalledWith({
      where: { gatewayTransactionId: row.gatewayTransactionId, paidAt: null },
      data: { paymentMethod: PaymentMethod.CARD, paidAt: generatedAt },
    });
  });

  it('updates gateway payment fields with optimistic concurrency', async () => {
    const billing = Billing.restore(row.id, {
      serviceOrderId: row.serviceOrderId,
      budgetId: row.budgetId,
      amount: Money.fromCents(row.amountCents),
      status: BillingStatus.WAITING_PAYMENT,
      paymentLink: row.paymentLink,
      gatewayTransactionId: row.gatewayTransactionId,
      expiresAt: row.expiresAt,
      generatedAt: row.generatedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    billing.registerPayment({
      gatewayTransactionId: row.gatewayTransactionId,
      method: PaymentMethod.CARD,
      paidAt: generatedAt,
    });
    const transaction = {
      billing: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          ...row,
          status: BillingStatus.PAID,
          paymentMethod: PaymentMethod.CARD,
          paidAt: generatedAt,
        }),
      },
    };
    prisma.$transaction.mockImplementation((fn) =>
      Promise.resolve(fn(transaction) as Promise<Billing | null>),
    );

    const updated = await repository.update(billing, row.updatedAt);

    expect(transaction.billing.updateMany).toHaveBeenCalledWith({
      where: { id: row.id, updatedAt: row.updatedAt },
      data: {
        status: BillingStatus.PAID,
        amountCents: row.amountCents,
        paymentLink: row.paymentLink,
        gatewayTransactionId: row.gatewayTransactionId,
        paymentMethod: PaymentMethod.CARD,
        generatedAt,
        paidAt: generatedAt,
        expiresAt,
        updatedAt: billing.getUpdatedAt(),
      },
    });
    expect(updated?.getStatus()).toBe(BillingStatus.PAID);
  });

  it('returns null when the billing was changed concurrently', async () => {
    const billing = Billing.restore(row.id, {
      serviceOrderId: row.serviceOrderId,
      budgetId: row.budgetId,
      amount: Money.fromCents(row.amountCents),
      status: BillingStatus.WAITING_PAYMENT,
      paymentLink: row.paymentLink,
      gatewayTransactionId: row.gatewayTransactionId,
      expiresAt: row.expiresAt,
      generatedAt: row.generatedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    const transaction = {
      billing: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    prisma.$transaction.mockImplementation((fn) =>
      Promise.resolve(fn(transaction) as Promise<Billing | null>),
    );

    await expect(repository.update(billing, row.updatedAt)).resolves.toBeNull();
    expect(transaction.billing.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: row.id, updatedAt: row.updatedAt },
      }),
    );
  });
});

import { PrismaService } from '../../../shared/database/prisma.service';
import { Billing } from '../entities/billing.entity';
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentAmount } from '../value-objects/payment-amount.vo';
import { BillingRepository } from './billing.repository';

const row = {
  id: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
  serviceOrderId: 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
  status: 'OPEN',
  totalCents: 12000,
  paidCents: 0,
  balanceCents: 12000,
  createdAt: new Date('2026-08-20T10:00:00.000Z'),
  updatedAt: new Date('2026-08-20T10:00:00.000Z'),
  payments: [],
};

describe('BillingRepository', () => {
  let prisma: {
    billing: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
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
      $transaction: jest.fn(),
    };
    repository = new BillingRepository(prisma as unknown as PrismaService);
  });

  it('creates a billing including payments', async () => {
    prisma.billing.create.mockResolvedValue(row);

    const billing = Billing.create({
      serviceOrderId: row.serviceOrderId,
      totalAmountInCents: row.totalCents,
    });

    await repository.create(billing);

    expect(prisma.billing.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: billing.getId(),
        serviceOrderId: row.serviceOrderId,
        totalCents: row.totalCents,
        paidCents: 0,
        balanceCents: row.totalCents,
      }),
      include: { payments: true },
    });
  });

  it('finds billing by service order id', async () => {
    prisma.billing.findUnique.mockResolvedValue(row);

    const billing = await repository.findByServiceOrderId(row.serviceOrderId);

    expect(prisma.billing.findUnique).toHaveBeenCalledWith({
      where: { serviceOrderId: row.serviceOrderId },
      include: { payments: true },
    });
    expect(billing?.getId()).toBe(row.id);
  });

  it('updates billing and replaces payment rows transactionally', async () => {
    const billing = Billing.create({
      serviceOrderId: row.serviceOrderId,
      totalAmountInCents: row.totalCents,
    });
    billing.registerPayment({
      amount: PaymentAmount.fromCents(12000),
      method: PaymentMethod.PIX,
    });

    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        billing: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            ...row,
            status: 'PAID',
            paidCents: 12000,
            balanceCents: 0,
            payments: [
              {
                id: billing.getPayments()[0].getId(),
                billingId: billing.getId(),
                amountCents: 12000,
                method: PaymentMethod.PIX,
                paidAt: billing.getPayments()[0].getPaidAt(),
                createdAt: billing.getPayments()[0].getCreatedAt(),
              },
            ],
          }),
        },
        billingPayment: {
          deleteMany: jest.fn(),
          createMany: jest.fn(),
        },
      }),
    );

    const updated = await repository.update(billing, row.updatedAt);

    expect(updated.getStatus()).toBe('PAID');
    expect(updated.getPayments()).toHaveLength(1);
  });

  it('does not replace payment rows when the billing was changed concurrently', async () => {
    const billing = Billing.restore(row.id, {
      serviceOrderId: row.serviceOrderId,
      totalAmountInCents: row.totalCents,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    billing.registerPayment({
      amount: PaymentAmount.fromCents(5000),
      method: PaymentMethod.PIX,
    });
    const transaction = {
      billing: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      billingPayment: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    prisma.$transaction.mockImplementation(async (fn) => fn(transaction));

    await expect(repository.update(billing, row.updatedAt)).resolves.toBeNull();
    expect(transaction.billing.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: row.id, updatedAt: row.updatedAt },
      }),
    );
    expect(transaction.billingPayment.deleteMany).not.toHaveBeenCalled();
    expect(transaction.billingPayment.createMany).not.toHaveBeenCalled();
  });
});

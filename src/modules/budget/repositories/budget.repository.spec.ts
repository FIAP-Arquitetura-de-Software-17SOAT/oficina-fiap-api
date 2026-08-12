import { PrismaService } from '../../../shared/database/prisma.service';
import {
  Budget,
  BudgetItemType,
  BudgetStatus,
} from '../entities/budget.entity';
import { BudgetRepository } from './budget.repository';

const row = {
  id: 'budget-123',
  serviceOrderId: 'service-123',
  version: 1,
  status: BudgetStatus.GENERATED,
  totalAmount: 100,
  refusalReason: null,
  sentAt: null,
  answeredAt: null,
  createdAt: new Date('2026-08-12T10:00:00.000Z'),
  updatedAt: new Date('2026-08-12T10:00:00.000Z'),
  items: [
    {
      id: 'item-123',
      description: 'Oil change',
      type: BudgetItemType.SERVICE,
      quantity: 2,
      unitPrice: 50,
    },
  ],
};

const makeBudget = () =>
  Budget.restore(row.id, {
    serviceOrderId: row.serviceOrderId,
    version: row.version,
    status: row.status,
    items: row.items,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

describe('BudgetRepository', () => {
  let repository: BudgetRepository;
  let prisma: {
    budget: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    budgetItem: { deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      budget: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      budgetItem: { deleteMany: jest.fn() },
      $transaction: jest.fn(),
    };
    repository = new BudgetRepository(prisma as unknown as PrismaService);
  });

  it('creates the aggregate with nested items', async () => {
    prisma.budget.create.mockResolvedValue(row);

    const budget = await repository.create(makeBudget());

    expect(prisma.budget.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: row.id,
        totalAmount: 100,
        items: { create: [expect.objectContaining({ id: 'item-123' })] },
      }) as unknown,
      include: { items: true },
    });
    expect(budget.getId()).toBe(row.id);
  });

  it('finds a budget by id with its items', async () => {
    prisma.budget.findUnique.mockResolvedValue(row);

    const budget = await repository.findById(row.id);

    expect(prisma.budget.findUnique).toHaveBeenCalledWith({
      where: { id: row.id },
      include: { items: true },
    });
    expect(budget?.getItems()).toHaveLength(1);
  });

  it('returns null when a budget id is not found', async () => {
    prisma.budget.findUnique.mockResolvedValue(null);

    await expect(repository.findById('missing')).resolves.toBeNull();
  });

  it('replaces all items transactionally when updating a budget', async () => {
    const budget = makeBudget();
    budget.addItem({
      description: 'Oil filter',
      type: BudgetItemType.PART,
      quantity: 1,
      unitPrice: 30,
    });
    prisma.$transaction.mockImplementation(async (callback) =>
      callback({ budget: prisma.budget, budgetItem: prisma.budgetItem }),
    );
    prisma.budget.update.mockResolvedValue({
      ...row,
      totalAmount: 130,
      items: [
        ...row.items,
        {
          id: budget.getItems()[1].getId(),
          description: 'Oil filter',
          type: BudgetItemType.PART,
          quantity: 1,
          unitPrice: 30,
        },
      ],
    });

    const updated = await repository.update(budget);

    expect(prisma.budgetItem.deleteMany).toHaveBeenCalledWith({
      where: { budgetId: row.id },
    });
    expect(prisma.budget.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: row.id },
        include: { items: true },
        data: expect.objectContaining({
          totalAmount: 130,
          items: { create: expect.arrayContaining([expect.any(Object)]) },
        }) as unknown,
      }),
    );
    expect(updated.getTotalAmount()).toBe(130);
  });

  it('lists budgets for a service order with their items', async () => {
    prisma.budget.findMany.mockResolvedValue([row]);

    const budgets = await repository.findByServiceOrderId(row.serviceOrderId);

    expect(prisma.budget.findMany).toHaveBeenCalledWith({
      where: { serviceOrderId: row.serviceOrderId },
      include: { items: true },
    });
    expect(budgets).toHaveLength(1);
  });

  it('returns the last version for a service order', async () => {
    prisma.budget.findFirst.mockResolvedValue({ version: 3 });

    await expect(
      repository.findLastVersionByServiceOrderId(row.serviceOrderId),
    ).resolves.toBe(3);
    expect(prisma.budget.findFirst).toHaveBeenCalledWith({
      where: { serviceOrderId: row.serviceOrderId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
  });
});

import { PrismaService } from '../../../shared/database/prisma.service';
import {
  Budget,
  BudgetItemType,
  BudgetStatus,
} from '../entities/budget.entity';
import { BudgetRepository } from './budget.repository';

// O banco guarda dinheiro em centavos inteiros; o domínio trabalha em
// decimais. As duas formas são fixtures distintas de propósito.
const row = {
  id: 'budget-123',
  serviceOrderId: 'service-123',
  version: 1,
  status: BudgetStatus.GENERATED,
  totalCents: 10000,
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
      unitPriceCents: 5000,
      subtotalCents: 10000,
    },
  ],
};

const makeBudget = () =>
  Budget.restore(row.id, {
    serviceOrderId: row.serviceOrderId,
    version: row.version,
    status: row.status,
    items: [
      {
        id: 'item-123',
        description: 'Oil change',
        type: BudgetItemType.SERVICE,
        quantity: 2,
        unitPrice: 50,
      },
    ],
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
      updateMany: jest.Mock;
    };
    budgetItem: { deleteMany: jest.Mock; createMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      budget: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      budgetItem: { deleteMany: jest.fn(), createMany: jest.fn() },
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
        totalCents: 10000,
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

  it('persists generated-only changes only while the stored status is GENERATED', async () => {
    const budget = makeBudget();
    budget.addItem({
      description: 'Oil filter',
      type: BudgetItemType.PART,
      quantity: 1,
      unitPrice: 30,
    });
    prisma.$transaction.mockImplementation((callback) =>
      Promise.resolve(
        callback({
          budget: prisma.budget,
          budgetItem: prisma.budgetItem,
        }) as Promise<Budget | null>,
      ),
    );
    prisma.budget.updateMany.mockResolvedValue({ count: 1 });
    prisma.budget.findUnique.mockResolvedValue({
      ...row,
      totalCents: 13000,
      items: [
        ...row.items,
        {
          id: budget.getItems()[1].getId(),
          description: 'Oil filter',
          type: BudgetItemType.PART,
          quantity: 1,
          unitPriceCents: 3000,
          subtotalCents: 3000,
        },
      ],
    });

    const updated = await repository.updateGenerated(budget, row.updatedAt);

    expect(prisma.budget.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: row.id,
          status: BudgetStatus.GENERATED,
          updatedAt: row.updatedAt,
        },
      }),
    );
    expect(prisma.budgetItem.deleteMany).toHaveBeenCalledWith({
      where: { budgetId: row.id },
    });
    expect(prisma.budgetItem.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ budgetId: row.id }),
        ]),
      }),
    );
    expect(updated?.getTotalAmount()).toBe(130);
  });

  it('does not persist a generated-state change after the budget was sent', async () => {
    const budget = makeBudget();
    prisma.$transaction.mockImplementation((callback) =>
      Promise.resolve(
        callback({
          budget: prisma.budget,
          budgetItem: prisma.budgetItem,
        }) as Promise<Budget | null>,
      ),
    );
    prisma.budget.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.updateGenerated(budget, row.updatedAt),
    ).resolves.toBeNull();
    expect(prisma.budgetItem.deleteMany).not.toHaveBeenCalled();
  });

  it('persists waiting-approval decisions only while the stored status is WAITING_APPROVAL', async () => {
    const budget = makeBudget();
    budget.sendToCustomer();
    budget.accept();
    prisma.$transaction.mockImplementation((callback) =>
      Promise.resolve(
        callback({
          budget: prisma.budget,
          budgetItem: prisma.budgetItem,
        }) as Promise<Budget | null>,
      ),
    );
    prisma.budget.updateMany.mockResolvedValue({ count: 1 });
    prisma.budget.findUnique.mockResolvedValue({
      ...row,
      status: BudgetStatus.ACCEPTED,
      answeredAt: budget.getAnsweredAt(),
    });

    const updated = await repository.updateWaitingApproval(
      budget,
      row.updatedAt,
    );

    expect(prisma.budget.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: row.id,
          status: BudgetStatus.WAITING_APPROVAL,
          updatedAt: row.updatedAt,
        },
      }),
    );
    expect(updated?.getStatus()).toBe(BudgetStatus.ACCEPTED);
  });

  it('lists budgets for a service order with their items', async () => {
    prisma.budget.findMany.mockResolvedValue([row]);

    const budgets = await repository.findByServiceOrderId(row.serviceOrderId);

    expect(prisma.budget.findMany).toHaveBeenCalledWith({
      where: { serviceOrderId: row.serviceOrderId },
      include: { items: true },
      orderBy: { version: 'asc' },
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

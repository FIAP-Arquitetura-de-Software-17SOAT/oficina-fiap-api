import { PrismaService } from '../../../../shared/database/prisma.service';
import { Money } from '../../../../shared/domain/value-objects/money.vo';
import {
  Budget,
  BudgetItemType,
  BudgetStatus,
} from '../../domain/entities/budget.entity';
import { PrismaBudgetRepository } from './prisma-budget.repository';

// O banco guarda dinheiro em centavos inteiros; o domínio trabalha em
// decimais. As duas formas são fixtures distintas de propósito.
const row = {
  id: 'budget-123',
  serviceOrderId: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
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
        unitPrice: Money.fromDecimal(50),
      },
    ],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

describe('PrismaBudgetRepository', () => {
  let repository: PrismaBudgetRepository;
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
    repository = new PrismaBudgetRepository(prisma as unknown as PrismaService);
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
      partId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      description: 'Oil filter',
      type: BudgetItemType.PART,
      quantity: 1,
      unitPrice: Money.fromDecimal(30),
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
          partId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
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
    expect(updated?.getTotal().value).toBe(130);
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
    budget.sendToClient();
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

  it('lists all budgets with their items', async () => {
    prisma.budget.findMany.mockResolvedValue([row]);

    const budgets = await repository.findAll();

    expect(prisma.budget.findMany).toHaveBeenCalledWith({
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(budgets).toHaveLength(1);
  });

  it('lists budgets for a service order with their items', async () => {
    prisma.budget.findMany.mockResolvedValue([row]);

    const budgets = await repository.findByServiceOrderId(row.serviceOrderId);

    expect(prisma.budget.findMany).toHaveBeenCalledWith({
      where: { serviceOrderId: row.serviceOrderId },
      include: { items: true },
      orderBy: { version: 'desc' },
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

  it.each([
    [{ target: ['serviceOrderId', 'version'] }, 'BUDGET_VERSION_TAKEN'],
    [
      {
        driverAdapterError: {
          cause: { constraint: { fields: ['serviceOrderId', 'version'] } },
        },
      },
      'BUDGET_VERSION_TAKEN',
    ],
    [{ target: 'budget_serviceOrderId_version_key' }, 'BUDGET_VERSION_TAKEN'],
    [{ target: ['id'] }, 'BUDGET_VERSION_ALLOCATION'],
  ])('translates P2002 with meta %j into %s', async (meta, code) => {
    prisma.budget.create.mockRejectedValue({ code: 'P2002', meta });

    await expect(repository.create(makeBudget())).rejects.toMatchObject({
      code,
      kind: 'CONFLICT',
    });
  });

  it('propagates unknown database errors on create', async () => {
    prisma.budget.create.mockRejectedValue(new Error('connection lost'));

    await expect(repository.create(makeBudget())).rejects.toThrow(
      'connection lost',
    );
  });

  it('finds by approval token hash and by id, null when missing', async () => {
    prisma.budget.findUnique.mockResolvedValueOnce(row);
    await expect(
      repository.findByApprovalTokenHash('a'.repeat(64)),
    ).resolves.not.toBeNull();
    expect(prisma.budget.findUnique).toHaveBeenCalledWith({
      where: { approvalTokenHash: 'a'.repeat(64) },
      include: { items: true },
    });

    prisma.budget.findUnique.mockResolvedValueOnce(null);
    await expect(repository.findById('missing')).resolves.toBeNull();
  });

  it('finds the version still waiting for the customer', async () => {
    prisma.budget.findFirst.mockResolvedValueOnce({
      ...row,
      status: BudgetStatus.WAITING_APPROVAL,
    });

    const waiting = await repository.findWaitingApprovalByServiceOrderId(
      row.serviceOrderId,
    );

    expect(prisma.budget.findFirst).toHaveBeenCalledWith({
      where: {
        serviceOrderId: row.serviceOrderId,
        status: BudgetStatus.WAITING_APPROVAL,
      },
      include: { items: true },
      orderBy: { version: 'desc' },
    });
    expect(waiting?.getStatus()).toBe(BudgetStatus.WAITING_APPROVAL);

    prisma.budget.findFirst.mockResolvedValueOnce(null);
    await expect(
      repository.findWaitingApprovalByServiceOrderId('x'),
    ).resolves.toBeNull();
  });
});

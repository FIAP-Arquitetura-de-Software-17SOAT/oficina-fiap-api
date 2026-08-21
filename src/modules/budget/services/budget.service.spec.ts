import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Budget,
  BudgetItemType,
  BudgetStatus,
} from '../entities/budget.entity';
import { BudgetRepository } from '../repositories/budget.repository';
import { BudgetService } from './budget.service';

type MockedRepository = {
  [K in keyof BudgetRepository]: jest.Mock;
};

const makeBudget = () =>
  Budget.create({
    serviceOrderId: 'service-123',
    version: 1,
    items: [
      {
        description: 'Oil change',
        type: BudgetItemType.SERVICE,
        quantity: 1,
        unitPrice: 120,
      },
    ],
  });

describe('BudgetService', () => {
  let service: BudgetService;
  let repository: MockedRepository;

  beforeEach(async () => {
    repository = {
      create: jest.fn((budget: Budget) => budget),
      updateGenerated: jest.fn((budget: Budget) => budget),
      updateWaitingApproval: jest.fn((budget: Budget) => budget),
      findById: jest.fn(),
      findByServiceOrderId: jest.fn(),
      findLastVersionByServiceOrderId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BudgetService,
        { provide: BudgetRepository, useValue: repository },
      ],
    }).compile();

    service = module.get<BudgetService>(BudgetService);
  });

  it('creates first budget with version 1', async () => {
    repository.findLastVersionByServiceOrderId.mockResolvedValue(0);

    const result = await service.create({
      serviceOrderId: 'service-123',
      items: [
        {
          description: 'Oil change',
          type: BudgetItemType.SERVICE,
          quantity: 1,
          unitPrice: 120,
        },
      ],
    });

    expect(result.getVersion()).toBe(1);
    expect(repository.create).toHaveBeenCalled();
  });

  it('normalizes service order id before allocating the next version', async () => {
    repository.findLastVersionByServiceOrderId.mockResolvedValue(1);

    const result = await service.create({
      serviceOrderId: ' service-123 ',
      items: [
        {
          description: 'Oil change',
          type: BudgetItemType.SERVICE,
          quantity: 1,
          unitPrice: 120,
        },
      ],
    });

    expect(repository.findLastVersionByServiceOrderId).toHaveBeenCalledWith(
      'service-123',
    );
    expect(result.getServiceOrderId()).toBe('service-123');
    expect(result.getVersion()).toBe(2);
  });

  it('creates next budget with incremented version for same serviceOrderId', async () => {
    repository.findLastVersionByServiceOrderId.mockResolvedValue(2);

    const result = await service.create({
      serviceOrderId: 'service-123',
      items: [
        {
          description: 'Brake pad',
          type: BudgetItemType.PART,
          quantity: 1,
          unitPrice: 80,
        },
      ],
    });

    expect(result.getVersion()).toBe(3);
  });

  it('retries allocation with the next version after a duplicate version conflict', async () => {
    repository.findLastVersionByServiceOrderId
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    repository.create
      .mockRejectedValueOnce({
        code: 'P2002',
        meta: { target: ['serviceOrderId', 'version'] },
      })
      .mockImplementation((budget: Budget) => budget);

    const result = await service.create({
      serviceOrderId: 'service-123',
      items: [
        {
          description: 'Brake pad',
          type: BudgetItemType.PART,
          quantity: 1,
          unitPrice: 80,
        },
      ],
    });

    expect(result.getVersion()).toBe(3);
    expect(repository.create).toHaveBeenCalledTimes(2);
  });

  it('translates a non-version unique conflict to a controlled error', async () => {
    repository.findLastVersionByServiceOrderId.mockResolvedValue(0);
    repository.create.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['id'] },
    });

    await expect(
      service.create({
        serviceOrderId: 'service-123',
        items: [
          {
            description: 'Brake pad',
            type: BudgetItemType.PART,
            quantity: 1,
            unitPrice: 80,
          },
        ],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('retries allocation after an adapter-reported version unique conflict', async () => {
    repository.findLastVersionByServiceOrderId
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    repository.create
      .mockRejectedValueOnce({
        code: 'P2002',
        meta: {
          driverAdapterError: {
            cause: { constraint: { fields: ['serviceOrderId', 'version'] } },
          },
        },
      })
      .mockImplementation((budget: Budget) => budget);

    const result = await service.create({
      serviceOrderId: 'service-123',
      items: [
        {
          description: 'Brake pad',
          type: BudgetItemType.PART,
          quantity: 1,
          unitPrice: 80,
        },
      ],
    });

    expect(result.getVersion()).toBe(3);
    expect(repository.create).toHaveBeenCalledTimes(2);
  });

  it('retries allocation when Prisma reports the version constraint as a string', async () => {
    repository.findLastVersionByServiceOrderId
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    repository.create
      .mockRejectedValueOnce({
        code: 'P2002',
        meta: { target: 'budget_serviceOrderId_version_key' },
      })
      .mockImplementation((budget: Budget) => budget);

    const result = await service.create({
      serviceOrderId: 'service-123',
      items: [
        {
          description: 'Brake pad',
          type: BudgetItemType.PART,
          quantity: 1,
          unitPrice: 80,
        },
      ],
    });

    expect(result.getVersion()).toBe(3);
    expect(repository.create).toHaveBeenCalledTimes(2);
  });

  it('does not retry an adapter-reported non-version unique conflict', async () => {
    repository.findLastVersionByServiceOrderId.mockResolvedValue(0);
    repository.create.mockRejectedValue({
      code: 'P2002',
      meta: {
        driverAdapterError: {
          cause: { constraint: { fields: ['id'] } },
        },
      },
    });

    await expect(
      service.create({
        serviceOrderId: 'service-123',
        items: [
          {
            description: 'Brake pad',
            type: BudgetItemType.PART,
            quantity: 1,
            unitPrice: 80,
          },
        ],
      }),
    ).rejects.toThrow(ConflictException);
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('adds an item to a generated budget and persists the new total', async () => {
    const budget = makeBudget();
    const expectedUpdatedAt = budget.getUpdatedAt();
    repository.findById.mockResolvedValue(budget);

    const result = await service.addItem(budget.getId(), {
      description: 'Oil filter',
      type: BudgetItemType.PART,
      quantity: 1,
      unitPrice: 40,
    });

    expect(result.getItems()).toHaveLength(2);
    expect(result.getTotalAmount()).toBe(160);
    expect(repository.updateGenerated).toHaveBeenCalledWith(
      result,
      expectedUpdatedAt,
    );
  });

  it('removes an item from a generated budget and persists the new total', async () => {
    const budget = makeBudget();
    budget.addItem({
      description: 'Oil filter',
      type: BudgetItemType.PART,
      quantity: 1,
      unitPrice: 40,
    });
    repository.findById.mockResolvedValue(budget);

    const itemId = budget.getItems()[1].getId();
    const result = await service.removeItem(budget.getId(), itemId);

    expect(result.getItems()).toHaveLength(1);
    expect(result.getTotalAmount()).toBe(120);
    expect(repository.updateGenerated).toHaveBeenCalledWith(
      result,
      expect.any(Date),
    );
  });

  it('calculates total from persisted budget items', async () => {
    const budget = makeBudget();
    budget.addItem({
      description: 'Oil change',
      type: BudgetItemType.SERVICE,
      quantity: 1,
      unitPrice: 120,
    });
    repository.findById.mockResolvedValue(budget);

    await expect(service.calculateTotal(budget.getId())).resolves.toBe(240);
  });

  it('sends a generated budget to the customer', async () => {
    const budget = makeBudget();
    repository.findById.mockResolvedValue(budget);

    const result = await service.send(budget.getId());

    expect(result.getStatus()).toBe(BudgetStatus.WAITING_APPROVAL);
    expect(result.getSentAt()).toBeInstanceOf(Date);
    expect(repository.updateGenerated).toHaveBeenCalledWith(
      result,
      expect.any(Date),
    );
  });

  it('accepts a budget waiting for approval and persists terminal status', async () => {
    const budget = makeBudget();
    budget.sendToCustomer();
    const expectedUpdatedAt = budget.getUpdatedAt();
    repository.findById.mockResolvedValue(budget);

    const result = await service.accept(budget.getId());

    expect(result.getStatus()).toBe(BudgetStatus.ACCEPTED);
    expect(result.getAnsweredAt()).toBeInstanceOf(Date);
    expect(result.getRefusalReason()).toBeNull();
    expect(repository.updateWaitingApproval).toHaveBeenCalledWith(
      result,
      expectedUpdatedAt,
    );
  });

  it('refuses a budget waiting for approval with a required reason', async () => {
    const budget = makeBudget();
    budget.sendToCustomer();
    repository.findById.mockResolvedValue(budget);

    const result = await service.refuse(budget.getId(), {
      reason: 'Customer found it expensive',
    });

    expect(result.getStatus()).toBe(BudgetStatus.REFUSED);
    expect(result.getRefusalReason()).toBe('Customer found it expensive');
    expect(result.getAnsweredAt()).toBeInstanceOf(Date);
    expect(repository.updateWaitingApproval).toHaveBeenCalledWith(
      result,
      expect.any(Date),
    );
  });

  it('rejects a generated-state change when its conditional persistence is stale', async () => {
    const budget = makeBudget();
    repository.findById.mockResolvedValue(budget);
    repository.updateGenerated.mockResolvedValue(null);

    await expect(
      service.addItem(budget.getId(), {
        description: 'Oil filter',
        type: BudgetItemType.PART,
        quantity: 1,
        unitPrice: 40,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects a waiting-approval decision when its conditional persistence is stale', async () => {
    const budget = makeBudget();
    budget.sendToCustomer();
    repository.findById.mockResolvedValue(budget);
    repository.updateWaitingApproval.mockResolvedValue(null);

    await expect(service.accept(budget.getId())).rejects.toThrow(
      ConflictException,
    );
  });

  it('throws NotFoundException when budget does not exist', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(service.findById('missing')).rejects.toThrow(
      new NotFoundException('Budget not found'),
    );
  });

  it('finds budgets by service order id', async () => {
    const budgets = [makeBudget()];
    repository.findByServiceOrderId.mockResolvedValue(budgets);

    await expect(service.findByServiceOrderId(' service-123 ')).resolves.toBe(
      budgets,
    );
    expect(repository.findByServiceOrderId).toHaveBeenCalledWith('service-123');
  });
});

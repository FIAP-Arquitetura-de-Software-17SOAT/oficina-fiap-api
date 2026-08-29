import { Test, TestingModule } from '@nestjs/testing';
import { BudgetItemType } from '../entities/budget.entity';
import { Budget } from '../entities/budget.entity';
import { BudgetService } from '../services/budget.service';
import { BudgetController } from './budget.controller';
import { Money } from '../../../shared/domain/value-objects/money.vo';

const PART_ID = 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

const makeBudget = () =>
  Budget.create({
    serviceOrderId: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
    version: 1,
    items: [
      {
        description: 'Oil change',
        type: BudgetItemType.SERVICE,
        quantity: 1,
        unitPrice: Money.fromDecimal(120),
      },
    ],
  });

describe('BudgetController', () => {
  let controller: BudgetController;
  let service: {
    create: jest.Mock;
    addItem: jest.Mock;
    removeItem: jest.Mock;
    calculateTotal: jest.Mock;
    send: jest.Mock;
    accept: jest.Mock;
    refuse: jest.Mock;
    findById: jest.Mock;
    findAll: jest.Mock;
    findByServiceOrderId: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      addItem: jest.fn(),
      removeItem: jest.fn(),
      calculateTotal: jest.fn(),
      send: jest.fn(),
      accept: jest.fn(),
      refuse: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      findByServiceOrderId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BudgetController],
      providers: [{ provide: BudgetService, useValue: service }],
    }).compile();

    controller = module.get<BudgetController>(BudgetController);
  });

  it('creates a budget and returns its calculated total', async () => {
    const budget = makeBudget();
    const dto = {
      serviceOrderId: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
      items: [
        {
          description: 'Oil change',
          type: BudgetItemType.SERVICE,
          quantity: 1,
          unitPrice: 120,
        },
      ],
    };
    service.create.mockResolvedValue(budget);

    const result = await controller.create(dto);

    expect(service.create).toHaveBeenCalledWith(dto);
    expect(result.totalAmount).toBe(120);
  });

  it('adds an item to a budget', async () => {
    const budget = makeBudget();
    budget.addItem({
      partId: PART_ID,
      description: 'Oil filter',
      type: BudgetItemType.PART,
      quantity: 1,
      unitPrice: Money.fromDecimal(40),
    });
    const dto = {
      partId: PART_ID,
      description: 'Oil filter',
      type: BudgetItemType.PART,
      quantity: 1,
      unitPrice: 40,
    };
    service.addItem.mockResolvedValue(budget);

    const result = await controller.addItem(budget.getId(), dto);

    expect(service.addItem).toHaveBeenCalledWith(budget.getId(), dto);
    expect(result.totalAmount).toBe(160);
  });

  it('removes an item from a budget', async () => {
    const budget = makeBudget();
    budget.addItem({
      partId: PART_ID,
      description: 'Oil filter',
      type: BudgetItemType.PART,
      quantity: 1,
      unitPrice: Money.fromDecimal(40),
    });
    const itemId = budget.getItems()[1].getId();
    budget.removeItem(itemId);
    service.removeItem.mockResolvedValue(budget);

    const result = await controller.removeItem(budget.getId(), itemId);

    expect(service.removeItem).toHaveBeenCalledWith(budget.getId(), itemId);
    expect(result.items).toHaveLength(1);
    expect(result.totalAmount).toBe(120);
  });

  it('calculates a budget total', async () => {
    const id = '7f2d8c49-29d8-4b1a-9f3a-bb95c2bb4b0a';
    service.calculateTotal.mockResolvedValue(120);

    await expect(controller.calculateTotal(id)).resolves.toEqual({
      budgetId: id,
      totalAmount: 120,
    });
    expect(service.calculateTotal).toHaveBeenCalledWith(id);
  });

  it('sends a budget to the customer', async () => {
    const budget = makeBudget();
    budget.sendToClient();
    service.send.mockResolvedValue(budget);

    const result = await controller.send(budget.getId());

    expect(service.send).toHaveBeenCalledWith(budget.getId());
    expect(result.status).toBe('WAITING_APPROVAL');
  });

  it('accepts a budget waiting for approval', async () => {
    const budget = makeBudget();
    budget.sendToClient();
    budget.accept();
    service.accept.mockResolvedValue(budget);

    const result = await controller.accept(budget.getId());

    expect(service.accept).toHaveBeenCalledWith(budget.getId());
    expect(result.status).toBe('ACCEPTED');
  });

  it('refuses a budget with its reason', async () => {
    const budget = makeBudget();
    budget.sendToClient();
    budget.refuse('Customer found it expensive');
    const dto = { reason: 'Customer found it expensive' };
    service.refuse.mockResolvedValue(budget);

    const result = await controller.refuse(budget.getId(), dto);

    expect(service.refuse).toHaveBeenCalledWith(budget.getId(), dto);
    expect(result.refusalReason).toBe('Customer found it expensive');
  });

  it('finds a budget by id', async () => {
    const budget = makeBudget();
    service.findById.mockResolvedValue(budget);

    const result = await controller.findById(budget.getId());

    expect(service.findById).toHaveBeenCalledWith(budget.getId());
    expect(result.id).toBe(budget.getId());
  });

  it('lists all budgets when no filter is given', async () => {
    const budgets = [makeBudget()];
    service.findAll.mockResolvedValue(budgets);

    const result = await controller.findAll({});

    expect(service.findAll).toHaveBeenCalledWith();
    expect(service.findByServiceOrderId).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it('narrows the listing to a service order when the filter is given', async () => {
    const budgets = [makeBudget()];
    service.findByServiceOrderId.mockResolvedValue(budgets);

    const result = await controller.findAll({
      serviceOrderId: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
    });

    expect(service.findByServiceOrderId).toHaveBeenCalledWith(
      '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
    );
    expect(service.findAll).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].serviceOrderId).toBe(
      '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
    );
  });
});

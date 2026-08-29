import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BudgetController } from '../../budget/controllers/budget.controller';
import {
  BudgetItemType,
  BudgetStatus,
} from '../../budget/entities/budget.entity';
import { PurchaseOrderController } from '../../purchase-order/controllers/purchase-order.controller';
import { ServiceOrderController } from '../../service-order/controllers/service-order.controller';
import { MeasurementUnit, Part, PartType } from '../entities/part.entity';
import { PartService } from './part.service';
import { PartsDispatchService } from './parts-dispatch.service';
import { StockMovementService } from './stock-movement.service';

const SERVICE_ORDER_ID = 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c';
const PART_ID = 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

const makePart = (quantity: number) =>
  Part.create({
    code: 'OIL-FILTER-123',
    name: 'Filtro de óleo',
    type: PartType.PART,
    unit: MeasurementUnit.UNIT,
    unitPrice: 149.9,
    quantity,
    minimumQuantity: 1,
  });

const makeBudget = (overrides: Record<string, unknown> = {}) => ({
  id: 'budget-1',
  serviceOrderId: SERVICE_ORDER_ID,
  version: 1,
  status: BudgetStatus.ACCEPTED,
  totalAmount: 300,
  refusalReason: null,
  sentAt: null,
  answeredAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  items: [
    {
      id: 'item-1',
      partId: PART_ID,
      description: 'Filtro de óleo',
      type: BudgetItemType.PART,
      quantity: 2,
      unitPrice: 150,
      subtotal: 300,
    },
  ],
  ...overrides,
});

describe('PartsDispatchService', () => {
  let service: PartsDispatchService;
  let partService: { findById: jest.Mock };
  let stockMovementService: { decrease: jest.Mock };
  let budgetController: { findByServiceOrderId: jest.Mock };
  let serviceOrderController: { registerPartsDispatched: jest.Mock };
  let purchaseOrderController: { registerShortage: jest.Mock };

  beforeEach(async () => {
    partService = { findById: jest.fn() };
    stockMovementService = { decrease: jest.fn() };
    budgetController = { findByServiceOrderId: jest.fn() };
    serviceOrderController = { registerPartsDispatched: jest.fn() };
    purchaseOrderController = { registerShortage: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PartsDispatchService,
        { provide: PartService, useValue: partService },
        { provide: StockMovementService, useValue: stockMovementService },
        { provide: BudgetController, useValue: budgetController },
        { provide: ServiceOrderController, useValue: serviceOrderController },
        {
          provide: PurchaseOrderController,
          useValue: purchaseOrderController,
        },
      ],
    }).compile();

    service = module.get(PartsDispatchService);
  });

  it('baixa o estoque e move a OS para execução quando há saldo', async () => {
    budgetController.findByServiceOrderId.mockResolvedValue([makeBudget()]);
    partService.findById.mockResolvedValue(makePart(5));

    const result = await service.dispatchForServiceOrder(SERVICE_ORDER_ID);

    expect(stockMovementService.decrease).toHaveBeenCalledWith(PART_ID, {
      quantity: 2,
      idempotencyKey: `budget:budget-1:part:${PART_ID}`,
    });
    expect(serviceOrderController.registerPartsDispatched).toHaveBeenCalledWith(
      SERVICE_ORDER_ID,
    );
    expect(result.dispatched).toBe(true);
    expect(result.purchaseOrderId).toBeNull();
  });

  it('abre pedido de compra com a diferença e não baixa nada quando falta peça', async () => {
    budgetController.findByServiceOrderId.mockResolvedValue([makeBudget()]);
    partService.findById.mockResolvedValue(makePart(1));
    purchaseOrderController.registerShortage.mockResolvedValue({
      id: 'purchase-order-1',
    });

    const result = await service.dispatchForServiceOrder(SERVICE_ORDER_ID);

    expect(purchaseOrderController.registerShortage).toHaveBeenCalledWith({
      items: [{ partId: PART_ID, quantity: 1 }],
    });
    expect(stockMovementService.decrease).not.toHaveBeenCalled();
    expect(
      serviceOrderController.registerPartsDispatched,
    ).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      dispatched: false,
      purchaseOrderId: 'purchase-order-1',
    });
  });

  it('usa o orçamento aceito de maior versão', async () => {
    budgetController.findByServiceOrderId.mockResolvedValue([
      makeBudget({ id: 'budget-1', version: 1 }),
      makeBudget({ id: 'budget-2', version: 2 }),
      makeBudget({
        id: 'budget-3',
        version: 3,
        status: BudgetStatus.BUDGET_REFUSED,
      }),
    ]);
    partService.findById.mockResolvedValue(makePart(5));

    await service.dispatchForServiceOrder(SERVICE_ORDER_ID);

    expect(stockMovementService.decrease).toHaveBeenCalledWith(
      PART_ID,
      expect.objectContaining({
        idempotencyKey: `budget:budget-2:part:${PART_ID}`,
      }),
    );
  });

  it('arredonda quantidade fracionária para cima', async () => {
    budgetController.findByServiceOrderId.mockResolvedValue([
      makeBudget({
        items: [
          {
            id: 'item-1',
            partId: PART_ID,
            description: 'Óleo',
            type: BudgetItemType.PART,
            quantity: 2.5,
            unitPrice: 40,
            subtotal: 100,
          },
        ],
      }),
    ]);
    partService.findById.mockResolvedValue(makePart(5));

    await service.dispatchForServiceOrder(SERVICE_ORDER_ID);

    expect(stockMovementService.decrease).toHaveBeenCalledWith(
      PART_ID,
      expect.objectContaining({ quantity: 3 }),
    );
  });

  it('recusa OS sem orçamento aceito', async () => {
    budgetController.findByServiceOrderId.mockResolvedValue([
      makeBudget({ status: BudgetStatus.WAITING_APPROVAL }),
    ]);

    await expect(
      service.dispatchForServiceOrder(SERVICE_ORDER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('libera a OS sem baixar nada quando o orçamento só tem serviços', async () => {
    budgetController.findByServiceOrderId.mockResolvedValue([
      makeBudget({
        items: [
          {
            id: 'item-1',
            partId: null,
            description: 'Troca de óleo',
            type: BudgetItemType.SERVICE,
            quantity: 1,
            unitPrice: 120,
            subtotal: 120,
          },
        ],
      }),
    ]);

    const result = await service.dispatchForServiceOrder(SERVICE_ORDER_ID);

    expect(stockMovementService.decrease).not.toHaveBeenCalled();
    expect(serviceOrderController.registerPartsDispatched).toHaveBeenCalledWith(
      SERVICE_ORDER_ID,
    );
    expect(result.dispatched).toBe(true);
    expect(result.requirements).toEqual([]);
  });

  it('recusa item de peça que não referencia peça em vez de ignorá-lo', async () => {
    budgetController.findByServiceOrderId.mockResolvedValue([
      makeBudget({
        items: [
          {
            id: 'item-1',
            partId: null,
            description: 'Filtro sem referência',
            type: BudgetItemType.PART,
            quantity: 1,
            unitPrice: 40,
            subtotal: 40,
          },
        ],
      }),
    ]);

    await expect(
      service.dispatchForServiceOrder(SERVICE_ORDER_ID),
    ).rejects.toThrow('Filtro sem referência');
    expect(stockMovementService.decrease).not.toHaveBeenCalled();
  });
});

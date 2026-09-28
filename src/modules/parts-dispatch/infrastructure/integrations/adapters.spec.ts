import { BudgetService } from '../../../budget/services/budget.service';
import { RegisterShortageUseCase } from '../../../purchase-order/application/use-cases/register-shortage.use-case';
import { ServiceOrderService } from '../../../service-order/services/service-order.service';
import { StockApplicationError } from '../../../stock/application/errors/stock-application.error';
import { DecreaseStockUseCase } from '../../../stock/application/use-cases/decrease-stock.use-case';
import { FindPartUseCase } from '../../../stock/application/use-cases/find-part.use-case';
import { BudgetAdapter } from './budget.adapter';
import { PurchaseOrderAdapter } from './purchase-order.adapter';
import { ServiceOrderAdapter } from './service-order.adapter';
import { StockAdapter } from './stock.adapter';

const item = (type: string, partId: string | null) => ({
  getType: () => type,
  getPartId: () => partId,
  getDescription: () => `item ${partId ?? 'sem peça'}`,
  getQuantity: () => 2,
});

const budget = (id: string, version: number, status: string) => ({
  getId: () => id,
  getVersion: () => version,
  getStatus: () => status,
  getItems: () => [item('PART', 'part-1'), item('SERVICE', null)],
});

describe('parts-dispatch adapters', () => {
  it('BudgetAdapter keeps only accepted budgets and their part items', async () => {
    const budgets = {
      findByServiceOrderId: jest
        .fn()
        .mockResolvedValue([
          budget('b1', 1, 'ACCEPTED'),
          budget('b2', 2, 'REFUSED'),
        ]),
    };
    const adapter = new BudgetAdapter(budgets as unknown as BudgetService);

    await expect(adapter.findAccepted('so-1')).resolves.toEqual([
      {
        id: 'b1',
        version: 1,
        partItems: [
          { partId: 'part-1', description: 'item part-1', quantity: 2 },
        ],
      },
    ]);
    expect(budgets.findByServiceOrderId).toHaveBeenCalledWith('so-1');
  });

  describe('StockAdapter', () => {
    const parts = { execute: jest.fn() };
    const movements = { execute: jest.fn() };
    const adapter = new StockAdapter(
      parts as unknown as FindPartUseCase,
      movements as unknown as DecreaseStockUseCase,
    );

    it('projects the part onto the port shape', async () => {
      parts.execute.mockResolvedValue({
        getId: () => 'part-1',
        getName: () => 'Filtro',
        getQuantity: () => ({ getValue: () => 4 }),
      });

      await expect(adapter.findPart('part-1')).resolves.toEqual({
        id: 'part-1',
        name: 'Filtro',
        quantity: 4,
      });
    });

    it('turns PART_NOT_FOUND into null', async () => {
      parts.execute.mockRejectedValue(
        new StockApplicationError('PART_NOT_FOUND'),
      );

      await expect(adapter.findPart('missing')).resolves.toBeNull();
    });

    it('propagates any other failure', async () => {
      parts.execute.mockRejectedValue(new Error('database down'));

      await expect(adapter.findPart('part-1')).rejects.toThrow('database down');
    });

    it('decreases stock through the use case with the idempotency key', async () => {
      movements.execute.mockResolvedValue({});

      await adapter.decrease('part-1', 3, 'budget:b1:part:part-1');

      expect(movements.execute).toHaveBeenCalledWith('part-1', {
        quantity: 3,
        idempotencyKey: 'budget:b1:part:part-1',
      });
    });
  });

  it('ServiceOrderAdapter registers the dispatch on the service order', async () => {
    const serviceOrders = {
      registerPartsDispatched: jest.fn().mockResolvedValue({}),
    };
    const adapter = new ServiceOrderAdapter(
      serviceOrders as unknown as ServiceOrderService,
    );

    await adapter.registerPartsDispatched('so-1');

    expect(serviceOrders.registerPartsDispatched).toHaveBeenCalledWith('so-1');
  });

  it('PurchaseOrderAdapter opens the shortage purchase and returns its id', async () => {
    const purchaseOrders = {
      execute: jest.fn().mockResolvedValue({ getId: () => 'po-1' }),
    };
    const adapter = new PurchaseOrderAdapter(
      purchaseOrders as unknown as RegisterShortageUseCase,
    );

    await expect(
      adapter.registerShortage([{ partId: 'part-1', quantity: 1 }]),
    ).resolves.toEqual({ id: 'po-1' });
    expect(purchaseOrders.execute).toHaveBeenCalledWith({
      items: [{ partId: 'part-1', quantity: 1 }],
    });
  });
});

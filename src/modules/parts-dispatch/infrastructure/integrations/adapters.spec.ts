import { NotFoundException } from '@nestjs/common';
import { BudgetService } from '../../../budget/services/budget.service';
import { PurchaseOrderService } from '../../../purchase-order/services/purchase-order.service';
import { ServiceOrderService } from '../../../service-order/services/service-order.service';
import { PartService } from '../../../stock/services/part.service';
import { StockMovementService } from '../../../stock/services/stock-movement.service';
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
    const parts = { findById: jest.fn() };
    const movements = { decrease: jest.fn() };
    const adapter = new StockAdapter(
      parts as unknown as PartService,
      movements as unknown as StockMovementService,
    );

    it('projects the part onto the port shape', async () => {
      parts.findById.mockResolvedValue({
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

    it('turns the legacy NotFoundException into null', async () => {
      parts.findById.mockRejectedValue(
        new NotFoundException('Peça não encontrada'),
      );

      await expect(adapter.findPart('missing')).resolves.toBeNull();
    });

    it('propagates any other failure', async () => {
      parts.findById.mockRejectedValue(new Error('database down'));

      await expect(adapter.findPart('part-1')).rejects.toThrow('database down');
    });

    it('decreases stock through the movement service with the idempotency key', async () => {
      movements.decrease.mockResolvedValue({});

      await adapter.decrease('part-1', 3, 'budget:b1:part:part-1');

      expect(movements.decrease).toHaveBeenCalledWith('part-1', {
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
      registerShortage: jest.fn().mockResolvedValue({ getId: () => 'po-1' }),
    };
    const adapter = new PurchaseOrderAdapter(
      purchaseOrders as unknown as PurchaseOrderService,
    );

    await expect(
      adapter.registerShortage([{ partId: 'part-1', quantity: 1 }]),
    ).resolves.toEqual({ id: 'po-1' });
    expect(purchaseOrders.registerShortage).toHaveBeenCalledWith({
      items: [{ partId: 'part-1', quantity: 1 }],
    });
  });
});

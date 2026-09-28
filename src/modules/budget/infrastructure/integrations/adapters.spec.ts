import { ServiceCatalogApplicationError } from '../../../service-catalog/application/errors/service-catalog-application.error';
import { FindServiceUseCase } from '../../../service-catalog/application/use-cases/find-service.use-case';
import { ServiceOrderApplicationError } from '../../../service-order/application/errors/service-order-application.error';
import { AwaitApprovalUseCase } from '../../../service-order/application/use-cases/await-approval.use-case';
import { AwaitPartsUseCase } from '../../../service-order/application/use-cases/await-parts.use-case';
import { FindServiceOrderUseCase } from '../../../service-order/application/use-cases/find-service-order.use-case';
import { StockApplicationError } from '../../../stock/application/errors/stock-application.error';
import { FindPartUseCase } from '../../../stock/application/use-cases/find-part.use-case';
import { PartCatalogAdapter } from './part-catalog.adapter';
import { ServiceCatalogAdapter } from './service-catalog.adapter';
import { ServiceOrderAdapter } from './service-order.adapter';

describe('budget adapters', () => {
  describe('ServiceOrderAdapter', () => {
    const find = { execute: jest.fn() };
    const awaitApproval = { execute: jest.fn() };
    const awaitParts = { execute: jest.fn() };
    const adapter = new ServiceOrderAdapter(
      find as unknown as FindServiceOrderUseCase,
      awaitApproval as unknown as AwaitApprovalUseCase,
      awaitParts as unknown as AwaitPartsUseCase,
    );

    it('projects the service order onto id, owner and status', async () => {
      find.execute.mockResolvedValue({
        getId: () => 'so-1',
        getClientId: () => 'c-1',
        getStatus: () => 'IN_DIAGNOSIS',
      });
      await expect(adapter.findById('so-1')).resolves.toEqual({
        id: 'so-1',
        clientId: 'c-1',
        status: 'IN_DIAGNOSIS',
      });
    });

    it('turns SERVICE_ORDER_NOT_FOUND into null and propagates the rest', async () => {
      find.execute.mockRejectedValueOnce(
        new ServiceOrderApplicationError('SERVICE_ORDER_NOT_FOUND'),
      );
      await expect(adapter.findById('missing')).resolves.toBeNull();

      find.execute.mockRejectedValueOnce(new Error('db down'));
      await expect(adapter.findById('so-1')).rejects.toThrow('db down');
    });

    it('forwards the transitions', async () => {
      awaitApproval.execute.mockResolvedValue({});
      awaitParts.execute.mockResolvedValue({});
      await adapter.awaitApproval('so-1');
      await adapter.awaitParts('so-1');
      expect(awaitApproval.execute).toHaveBeenCalledWith('so-1');
      expect(awaitParts.execute).toHaveBeenCalledWith('so-1');
    });
  });

  describe.each([
    [
      'ServiceCatalogAdapter',
      (execute: jest.Mock) =>
        new ServiceCatalogAdapter({ execute } as unknown as FindServiceUseCase),
      new ServiceCatalogApplicationError('SERVICE_NOT_FOUND'),
    ],
    [
      'PartCatalogAdapter',
      (execute: jest.Mock) =>
        new PartCatalogAdapter({ execute } as unknown as FindPartUseCase),
      new StockApplicationError('PART_NOT_FOUND'),
    ],
  ] as const)('%s', (_name, build, notFound) => {
    it('answers true, false on not-found and propagates other failures', async () => {
      const execute = jest
        .fn()
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(notFound)
        .mockRejectedValueOnce(new Error('db down'));
      const adapter = build(execute);

      await expect(adapter.exists('id')).resolves.toBe(true);
      await expect(adapter.exists('missing')).resolves.toBe(false);
      await expect(adapter.exists('id')).rejects.toThrow('db down');
    });
  });
});

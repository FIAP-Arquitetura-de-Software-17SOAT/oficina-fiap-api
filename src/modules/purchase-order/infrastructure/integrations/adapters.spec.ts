import { Money } from '../../../../shared/domain/value-objects/money.vo';
import { StockApplicationError } from '../../../stock/application/errors/stock-application.error';
import { FindPartUseCase } from '../../../stock/application/use-cases/find-part.use-case';
import { IncreaseStockUseCase } from '../../../stock/application/use-cases/increase-stock.use-case';
import { PartCatalogAdapter } from './part-catalog.adapter';
import { StockReceiptAdapter } from './stock-receipt.adapter';

describe('purchase-order adapters', () => {
  describe('PartCatalogAdapter', () => {
    const findPart = { execute: jest.fn() };
    const adapter = new PartCatalogAdapter(
      findPart as unknown as FindPartUseCase,
    );

    it('projects the part onto the catalog shape', async () => {
      const unitPrice = Money.fromDecimal(149.9);
      findPart.execute.mockResolvedValue({
        getId: () => 'part-1',
        getName: () => 'Filtro',
        getUnitPrice: () => unitPrice,
      });

      await expect(adapter.findById('part-1')).resolves.toEqual({
        id: 'part-1',
        name: 'Filtro',
        unitPrice,
      });
    });

    it('turns PART_NOT_FOUND into null', async () => {
      findPart.execute.mockRejectedValue(
        new StockApplicationError('PART_NOT_FOUND'),
      );

      await expect(adapter.findById('missing')).resolves.toBeNull();
    });

    it('propagates any other failure', async () => {
      findPart.execute.mockRejectedValue(new Error('database down'));

      await expect(adapter.findById('part-1')).rejects.toThrow('database down');
    });
  });

  it('StockReceiptAdapter increases stock with the idempotency key', async () => {
    const increaseStock = { execute: jest.fn().mockResolvedValue({}) };
    const adapter = new StockReceiptAdapter(
      increaseStock as unknown as IncreaseStockUseCase,
    );

    await adapter.increase('part-1', 4, 'purchase-order:po-1:item-1');

    expect(increaseStock.execute).toHaveBeenCalledWith('part-1', {
      quantity: 4,
      idempotencyKey: 'purchase-order:po-1:item-1',
    });
  });
});

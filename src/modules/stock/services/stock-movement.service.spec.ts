import { ConflictException } from '@nestjs/common';
import {
  InsufficientStockError,
  StockMovementRepository,
  StockMovementType,
} from '../repositories/stock-movement.repository';
import { StockMovementService } from './stock-movement.service';

describe('StockMovementService', () => {
  let service: StockMovementService;
  let repository: { apply: jest.Mock };

  beforeEach(() => {
    repository = { apply: jest.fn() };
    service = new StockMovementService(
      repository as unknown as StockMovementRepository,
    );
  });

  it('reports unavailable stock when an outbound atomic update cannot reserve it', async () => {
    repository.apply.mockRejectedValue(new InsufficientStockError());

    await expect(
      service.decrease('part-1', { quantity: 2, idempotencyKey: 'request-1' }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects a movement with zero quantity before persistence', async () => {
    await expect(
      service.increase('part-1', { quantity: 0, idempotencyKey: 'request-1' }),
    ).rejects.toThrow('Movement quantity must be a positive integer');

    expect(repository.apply).not.toHaveBeenCalled();
  });

  it('sends an inbound movement to the atomic repository', async () => {
    repository.apply.mockResolvedValue({ replayed: false });

    await service.increase('part-1', {
      quantity: 3,
      idempotencyKey: 'request-1',
    });

    expect(repository.apply).toHaveBeenCalledWith({
      partId: 'part-1',
      type: StockMovementType.IN,
      quantity: 3,
      idempotencyKey: 'request-1',
    });
  });
});

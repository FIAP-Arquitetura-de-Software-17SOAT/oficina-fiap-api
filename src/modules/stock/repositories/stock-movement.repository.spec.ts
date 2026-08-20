import { PrismaService } from '../../../shared/database/prisma.service';
import {
  StockMovementRepository,
  StockMovementType,
} from './stock-movement.repository';

const part = {
  id: 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
  code: 'OIL-FILTER-123',
  name: 'Oil filter',
  description: null,
  type: 'PART',
  unit: 'UNIT',
  unitPrice: { toString: () => '149.90' },
  quantity: 4,
  minimumQuantity: 3,
  createdAt: new Date('2026-01-01T10:00:00.000Z'),
  updatedAt: new Date('2026-01-01T10:00:00.000Z'),
};

describe('StockMovementRepository', () => {
  let repository: StockMovementRepository;
  let prisma: {
    $transaction: jest.Mock;
    part: { updateMany: jest.Mock; findUnique: jest.Mock };
    stockMovement: { create: jest.Mock; findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      part: { updateMany: jest.fn(), findUnique: jest.fn() },
      stockMovement: { create: jest.fn(), findUnique: jest.fn() },
    };
    prisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof prisma) => unknown) =>
        callback(prisma),
    );
    repository = new StockMovementRepository(
      prisma as unknown as PrismaService,
    );
  });

  it('decrements only when the persisted balance covers an outbound movement', async () => {
    prisma.stockMovement.create.mockResolvedValue({
      id: 'movement-1',
      idempotencyKey: 'request-1',
      type: StockMovementType.OUT,
      quantity: 6,
      partId: part.id,
      createdAt: part.createdAt,
    });
    prisma.part.updateMany.mockResolvedValue({ count: 1 });
    prisma.part.findUnique.mockResolvedValue(part);

    await repository.apply({
      partId: part.id,
      type: StockMovementType.OUT,
      quantity: 6,
      idempotencyKey: 'request-1',
    });

    expect(prisma.part.updateMany).toHaveBeenCalledWith({
      where: { id: part.id, quantity: { gte: 6 } },
      data: { quantity: { decrement: 6 } },
    });
  });

  it('replays the committed result without changing the balance again', async () => {
    const movement = {
      id: 'movement-1',
      idempotencyKey: 'request-1',
      type: StockMovementType.OUT,
      quantity: 6,
      partId: part.id,
      createdAt: part.createdAt,
    };
    prisma.stockMovement.create.mockRejectedValue({ code: 'P2002' });
    prisma.stockMovement.findUnique.mockResolvedValue(movement);
    prisma.part.findUnique.mockResolvedValue(part);

    const result = await repository.apply({
      partId: part.id,
      type: StockMovementType.OUT,
      quantity: 6,
      idempotencyKey: 'request-1',
    });

    expect(result.replayed).toBe(true);
    expect(result.movement.id).toBe('movement-1');
    expect(prisma.part.updateMany).not.toHaveBeenCalled();
  });

  it('does not report a successful replay when a unique conflict has no committed movement', async () => {
    prisma.stockMovement.create.mockRejectedValue({ code: 'P2002' });
    prisma.stockMovement.findUnique.mockResolvedValue(null);

    await expect(
      repository.apply({
        partId: part.id,
        type: StockMovementType.OUT,
        quantity: 6,
        idempotencyKey: 'request-1',
      }),
    ).rejects.toThrow('Idempotency key already in use');
  });
});

import { DomainException } from '../../../../shared/domain/domain.exception';
import {
  MeasurementUnit,
  Part,
  PartType,
} from '../../domain/entities/part.entity';
import { StockMovementType } from '../../domain/enums/stock-movement-type.enum';
import { StockApplicationError } from '../errors/stock-application.error';
import { PartRepositoryPort } from '../ports/part-repository.port';
import { CreatePartUseCase } from './create-part.use-case';
import { DecreaseStockUseCase } from './decrease-stock.use-case';
import { DeletePartUseCase } from './delete-part.use-case';
import { FindPartUseCase } from './find-part.use-case';
import { IncreaseStockUseCase } from './increase-stock.use-case';
import { ListPartsUseCase } from './list-parts.use-case';
import { UpdatePartUseCase } from './update-part.use-case';

const makePart = (overrides: Partial<Parameters<typeof Part.create>[0]> = {}) =>
  Part.create({
    code: 'OIL-FILTER-123',
    name: 'Oil filter',
    description: 'Filter for engine oil',
    type: PartType.PART,
    unit: MeasurementUnit.UNIT,
    unitPrice: 149.9,
    quantity: 10,
    minimumQuantity: 3,
    ...overrides,
  });

type MockedRepository = { [K in keyof PartRepositoryPort]: jest.Mock };

describe('Part use cases without Nest', () => {
  let repository: MockedRepository;
  let service: {
    create: CreatePartUseCase['execute'];
    findById: FindPartUseCase['execute'];
    findAll: ListPartsUseCase['execute'];
    update: UpdatePartUseCase['execute'];
    delete: DeletePartUseCase['execute'];
  };

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByCode: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    service = {
      create: (i) => new CreatePartUseCase(repository).execute(i),
      findById: (id) => new FindPartUseCase(repository).execute(id),
      findAll: () => new ListPartsUseCase(repository).execute(),
      update: (id, i) => new UpdatePartUseCase(repository).execute(id, i),
      delete: (id) => new DeletePartUseCase(repository).execute(id),
    };
  });

  describe('create', () => {
    const input = {
      code: ' oil-filter-123 ',
      name: 'Oil filter',
      description: 'Filter for engine oil',
      type: PartType.PART,
      unit: MeasurementUnit.UNIT,
      unitPrice: 149.9,
      minimumQuantity: 3,
    };

    it('creates a catalogue part with zero stock', async () => {
      repository.findByCode.mockResolvedValue(null);
      repository.create.mockImplementation((part: Part) => part);

      const created = await service.create(input);

      expect(repository.findByCode).toHaveBeenCalledWith('OIL-FILTER-123');
      expect(created.getCode().getValue()).toBe('OIL-FILTER-123');
      expect(created.getQuantity().getValue()).toBe(0);
      expect(repository.create).toHaveBeenCalledTimes(1);
    });

    it('rejects an existing part code', async () => {
      repository.findByCode.mockResolvedValue(makePart());

      await expect(service.create(input)).rejects.toMatchObject({
        code: 'PART_CODE_IN_USE',
        kind: 'CONFLICT',
        message: 'Código da peça já cadastrado',
      });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rejects invalid domain input before querying the repository', async () => {
      await expect(service.create({ ...input, unitPrice: -1 })).rejects.toThrow(
        DomainException,
      );

      expect(repository.findByCode).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('returns the found part', async () => {
      const part = makePart();
      repository.findById.mockResolvedValue(part);

      await expect(service.findById(part.getId())).resolves.toBe(part);
    });

    it('PART_NOT_FOUND for an unknown part', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toMatchObject({
        code: 'PART_NOT_FOUND',
        message: 'Peça não encontrada',
      });
    });
  });

  it('lists all parts', async () => {
    const parts = [makePart()];
    repository.findAll.mockResolvedValue(parts);

    await expect(service.findAll()).resolves.toBe(parts);
  });

  describe('update', () => {
    it('updates supplied fields and accepts its own normalized code', async () => {
      const part = makePart();
      repository.findById.mockResolvedValue(part);
      repository.findByCode.mockResolvedValue(part);
      repository.update.mockImplementation((updated: Part) => updated);

      const updated = await service.update(part.getId(), {
        code: 'oil-filter-123',
        unitPrice: 159.9,
      });

      expect(updated.getUnitPrice().value).toBe(159.9);
      expect(repository.update).toHaveBeenCalledWith(part);
    });

    it('rejects a code used by another part', async () => {
      const part = makePart();
      repository.findById.mockResolvedValue(part);
      repository.findByCode.mockResolvedValue(makePart({ code: 'OTHER-PART' }));

      await expect(
        service.update(part.getId(), { code: 'OTHER-PART' }),
      ).rejects.toThrow(StockApplicationError);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('does not update a missing part', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.update('missing', { name: 'Filter' }),
      ).rejects.toMatchObject({ code: 'PART_NOT_FOUND' });
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes an existing part', async () => {
      const part = makePart();
      repository.findById.mockResolvedValue(part);

      await service.delete(part.getId());

      expect(repository.delete).toHaveBeenCalledWith(part.getId());
    });

    it('does not delete a missing part', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.delete('missing')).rejects.toMatchObject({
        code: 'PART_NOT_FOUND',
      });
      expect(repository.delete).not.toHaveBeenCalled();
    });
  });
});

describe('Stock movement use cases without Nest', () => {
  let movements: { apply: jest.Mock };

  beforeEach(() => {
    movements = { apply: jest.fn() };
  });

  it('propagates INSUFFICIENT_STOCK from the atomic port', async () => {
    movements.apply.mockRejectedValue(
      new StockApplicationError('INSUFFICIENT_STOCK'),
    );

    await expect(
      new DecreaseStockUseCase(movements).execute('part-1', {
        quantity: 2,
        idempotencyKey: 'request-1',
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK', kind: 'CONFLICT' });
  });

  it('rejects a movement with zero quantity before persistence', async () => {
    await expect(
      new IncreaseStockUseCase(movements).execute('part-1', {
        quantity: 0,
        idempotencyKey: 'request-1',
      }),
    ).rejects.toMatchObject({
      code: 'MOVEMENT_QUANTITY_INVALID',
      message: 'Movement quantity must be a positive integer',
    });
    expect(movements.apply).not.toHaveBeenCalled();
  });

  it('rejects a blank idempotency key before persistence', async () => {
    await expect(
      new IncreaseStockUseCase(movements).execute('part-1', {
        quantity: 1,
        idempotencyKey: '   ',
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    expect(movements.apply).not.toHaveBeenCalled();
  });

  it('sends an inbound movement to the atomic port with the trimmed key', async () => {
    movements.apply.mockResolvedValue({ replayed: false });

    await new IncreaseStockUseCase(movements).execute('part-1', {
      quantity: 3,
      idempotencyKey: ' request-1 ',
    });

    expect(movements.apply).toHaveBeenCalledWith({
      partId: 'part-1',
      type: StockMovementType.IN,
      quantity: 3,
      idempotencyKey: 'request-1',
    });
  });

  it('sends an outbound movement as OUT', async () => {
    movements.apply.mockResolvedValue({ replayed: false });

    await new DecreaseStockUseCase(movements).execute('part-1', {
      quantity: 3,
      idempotencyKey: 'request-1',
    });

    expect(movements.apply).toHaveBeenCalledWith(
      expect.objectContaining({ type: StockMovementType.OUT }),
    );
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import {
  Part,
  MeasurementUnit,
  PartType,
} from '../../domain/entities/part.entity';
import { CreatePartUseCase } from '../../application/use-cases/create-part.use-case';
import { FindPartUseCase } from '../../application/use-cases/find-part.use-case';
import { ListPartsUseCase } from '../../application/use-cases/list-parts.use-case';
import { UpdatePartUseCase } from '../../application/use-cases/update-part.use-case';
import { DeletePartUseCase } from '../../application/use-cases/delete-part.use-case';
import { IncreaseStockUseCase } from '../../application/use-cases/increase-stock.use-case';
import { DecreaseStockUseCase } from '../../application/use-cases/decrease-stock.use-case';
import { PartController } from './part.controller';

const makePart = (code = 'OIL-FILTER-123') =>
  Part.create({
    code,
    name: 'Oil filter',
    description: 'Filter for engine oil',
    type: PartType.PART,
    unit: MeasurementUnit.UNIT,
    unitPrice: 149.9,
    quantity: 10,
    minimumQuantity: 3,
  });

describe('PartController', () => {
  let controller: PartController;
  let service: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let stockMovementService: { increase: jest.Mock; decrease: jest.Mock };

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    stockMovementService = { increase: jest.fn(), decrease: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PartController],
      providers: [
        { provide: CreatePartUseCase, useValue: { execute: service.create } },
        { provide: FindPartUseCase, useValue: { execute: service.findById } },
        { provide: ListPartsUseCase, useValue: { execute: service.findAll } },
        { provide: UpdatePartUseCase, useValue: { execute: service.update } },
        { provide: DeletePartUseCase, useValue: { execute: service.delete } },
        {
          provide: IncreaseStockUseCase,
          useValue: { execute: stockMovementService.increase },
        },
        {
          provide: DecreaseStockUseCase,
          useValue: { execute: stockMovementService.decrease },
        },
      ],
    }).compile();

    controller = module.get<PartController>(PartController);
  });

  it('creates a part and returns its primitive response DTO', async () => {
    const part = makePart();
    const dto = {
      code: 'OIL-FILTER-123',
      name: 'Oil filter',
      description: 'Filter for engine oil',
      type: PartType.PART,
      unit: MeasurementUnit.UNIT,
      unitPrice: 149.9,
      quantity: 10,
      minimumQuantity: 3,
    };
    service.create.mockResolvedValue(part);

    const response = await controller.create(dto);

    expect(response).toMatchObject({
      id: part.getId(),
      code: 'OIL-FILTER-123',
      unitPrice: 149.9,
      quantity: 10,
    });
  });

  it('returns every mapped part from the service', async () => {
    service.findAll.mockResolvedValue([makePart('A-1'), makePart('B-2')]);

    const response = await controller.findAll();

    expect(response.map((part) => part.code)).toEqual(['A-1', 'B-2']);
  });

  it('returns the requested part', async () => {
    const part = makePart();
    service.findById.mockResolvedValue(part);

    const response = await controller.findById(part.getId());

    expect(response.id).toBe(part.getId());
  });

  it('updates the requested part', async () => {
    const part = makePart();
    service.update.mockResolvedValue(part);

    // quantidade não é editável aqui: ela só muda por movimento de estoque
    const response = await controller.update(part.getId(), {
      minimumQuantity: 12,
    });

    expect(response.id).toBe(part.getId());
  });

  it('deletes the requested part without a response body', async () => {
    service.delete.mockResolvedValue(undefined);

    await expect(controller.delete('part-id')).resolves.toBeUndefined();
  });

  it('records an inbound movement through the movement service', async () => {
    const part = makePart();
    stockMovementService.increase.mockResolvedValue({
      part,
      movement: {
        id: 'movement-1',
        idempotencyKey: 'request-1',
        type: 'IN',
        quantity: 2,
        partId: part.getId(),
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
      },
      replayed: false,
    });

    const response = await controller.increaseStock(part.getId(), {
      quantity: 2,
      idempotencyKey: 'request-1',
    });

    expect(response.movement.type).toBe('IN');
    expect(response.part.id).toBe(part.getId());
  });

  it('records an outbound movement through the movement use case', async () => {
    const part = makePart();
    stockMovementService.decrease.mockResolvedValue({
      part,
      movement: {
        id: 'movement-2',
        idempotencyKey: 'request-2',
        type: 'OUT',
        quantity: 1,
        partId: part.getId(),
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
      },
      replayed: false,
    });

    const response = await controller.decreaseStock(part.getId(), {
      quantity: 1,
      idempotencyKey: 'request-2',
    });

    expect(stockMovementService.decrease).toHaveBeenCalledWith(part.getId(), {
      quantity: 1,
      idempotencyKey: 'request-2',
    });
    expect(response.movement.type).toBe('OUT');
    expect(response.part.code).toBe('OIL-FILTER-123');
  });
});

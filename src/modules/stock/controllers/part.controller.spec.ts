import { Test, TestingModule } from '@nestjs/testing';
import { Part, MeasurementUnit, PartType } from '../entities/part.entity';
import { PartService } from '../services/part.service';
import { StockMovementService } from '../services/stock-movement.service';
import { PartController } from './part.controller';

const makePart = (code = 'OIL-FILTER-123') =>
  Part.create({
    code,
    name: 'Oil filter',
    description: 'Filter for engine oil',
    type: PartType.PART,
    unit: MeasurementUnit.UNIT,
    unitPrice: '149.90',
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
        { provide: PartService, useValue: service },
        { provide: StockMovementService, useValue: stockMovementService },
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
      unitPrice: '149.90',
      quantity: 10,
      minimumQuantity: 3,
    };
    service.create.mockResolvedValue(part);

    const response = await controller.create(dto);

    expect(response).toMatchObject({
      id: part.getId(),
      code: 'OIL-FILTER-123',
      unitPrice: '149.90',
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

    const response = await controller.update(part.getId(), {
      quantity: 12,
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
});

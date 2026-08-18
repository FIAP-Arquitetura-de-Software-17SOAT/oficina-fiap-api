import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DomainException } from '../../../shared/domain/domain.exception';
import { MeasurementUnit, Part, PartType } from '../entities/part.entity';
import { PartRepository } from '../repositories/part.repository';
import { PartService } from './part.service';

const makePart = (
  overrides: Partial<Parameters<typeof Part.create>[0]> = {},
) =>
  Part.create({
    code: 'OIL-FILTER-123',
    name: 'Oil filter',
    description: 'Filter for engine oil',
    type: PartType.PART,
    unit: MeasurementUnit.UNIT,
    unitPrice: '149.90',
    quantity: 10,
    minimumQuantity: 3,
    ...overrides,
  });

type MockedRepository = {
  [K in keyof PartRepository]: jest.Mock;
};

describe('PartService', () => {
  let service: PartService;
  let repository: MockedRepository;

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByCode: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PartService, { provide: PartRepository, useValue: repository }],
    }).compile();

    service = module.get<PartService>(PartService);
  });

  describe('create', () => {
    const dto = {
      code: ' oil-filter-123 ',
      name: 'Oil filter',
      description: 'Filter for engine oil',
      type: PartType.PART,
      unit: MeasurementUnit.UNIT,
      unitPrice: '149.90',
      quantity: 10,
      minimumQuantity: 3,
    };

    it('creates a part when its normalized code is available', async () => {
      repository.findByCode.mockResolvedValue(null);
      repository.create.mockImplementation((part: Part) => part);

      const created = await service.create(dto);

      expect(repository.findByCode).toHaveBeenCalledWith('OIL-FILTER-123');
      expect(created.getCode().getValue()).toBe('OIL-FILTER-123');
      expect(repository.create).toHaveBeenCalledTimes(1);
    });

    it('rejects an existing part code', async () => {
      repository.findByCode.mockResolvedValue(makePart());

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rejects invalid domain input before querying the repository', async () => {
      await expect(service.create({ ...dto, unitPrice: '-1.00' })).rejects.toThrow(
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

    it('throws NotFoundException for an unknown part', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
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
        unitPrice: '159.9',
      });

      expect(updated.getUnitPrice().getValue()).toBe('159.90');
      expect(repository.update).toHaveBeenCalledWith(part);
    });

    it('rejects a code used by another part', async () => {
      const part = makePart();
      repository.findById.mockResolvedValue(part);
      repository.findByCode.mockResolvedValue(makePart({ code: 'OTHER-PART' }));

      await expect(service.update(part.getId(), { code: 'OTHER-PART' })).rejects.toThrow(
        ConflictException,
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('does not update a missing part', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.update('missing', { name: 'Filter' })).rejects.toThrow(
        NotFoundException,
      );
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

      await expect(service.delete('missing')).rejects.toThrow(NotFoundException);
      expect(repository.delete).not.toHaveBeenCalled();
    });
  });
});

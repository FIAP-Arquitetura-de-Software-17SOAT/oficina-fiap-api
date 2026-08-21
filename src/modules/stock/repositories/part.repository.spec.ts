import { PrismaService } from '../../../shared/database/prisma.service';
import { MeasurementUnit, Part, PartType } from '../entities/part.entity';
import { PartRepository } from './part.repository';

const row = {
  id: 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
  code: 'OIL-FILTER-123',
  name: 'Oil filter',
  description: 'Filter for engine oil',
  type: PartType.PART,
  unit: MeasurementUnit.UNIT,
  unitPrice: { toString: () => '149.90' },
  quantity: 10,
  minimumQuantity: 3,
  createdAt: new Date('2026-01-01T10:00:00.000Z'),
  updatedAt: new Date('2026-01-01T10:00:00.000Z'),
};

const makePart = () =>
  Part.restore(row.id, {
    code: row.code,
    name: row.name,
    description: row.description,
    type: row.type,
    unit: row.unit,
    unitPrice: row.unitPrice.toString(),
    quantity: row.quantity,
    minimumQuantity: row.minimumQuantity,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

describe('PartRepository', () => {
  let repository: PartRepository;
  let prisma: {
    part: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      part: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    repository = new PartRepository(prisma as unknown as PrismaService);
  });

  it('unwraps domain values when creating a part', async () => {
    prisma.part.create.mockResolvedValue(row);

    await repository.create(makePart());

    expect(prisma.part.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code: 'OIL-FILTER-123',
        unitPrice: '149.90',
        quantity: 10,
        minimumQuantity: 3,
      }) as unknown,
    });
  });

  it('restores a part from a database row', async () => {
    prisma.part.create.mockResolvedValue(row);

    const part = await repository.create(makePart());

    expect(part.getId()).toBe(row.id);
    expect(part.getUnitPrice().getValue()).toBe('149.90');
    expect(part.getCreatedAt()).toEqual(row.createdAt);
  });

  it.each([
    ['findById', () => repository.findById(row.id), { id: row.id }],
    ['findByCode', () => repository.findByCode(row.code), { code: row.code }],
  ])('%s queries using the correct key', async (_label, act, where) => {
    prisma.part.findUnique.mockResolvedValue(row);

    const part = await act();

    expect(prisma.part.findUnique).toHaveBeenCalledWith({ where });
    expect(part?.getId()).toBe(row.id);
  });

  it.each([
    ['findById', () => repository.findById('missing')],
    ['findByCode', () => repository.findByCode('MISSING')],
  ])('%s returns null when no row exists', async (_label, act) => {
    prisma.part.findUnique.mockResolvedValue(null);

    await expect(act()).resolves.toBeNull();
  });

  it('lists newest parts first', async () => {
    prisma.part.findMany.mockResolvedValue([row]);

    const parts = await repository.findAll();

    expect(prisma.part.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
    });
    expect(parts[0].getCode().getValue()).toBe(row.code);
  });

  it('persists all editable fields when updating a part', async () => {
    prisma.part.update.mockResolvedValue(row);

    await repository.update(makePart());

    expect(prisma.part.update).toHaveBeenCalledWith({
      where: { id: row.id },
      data: expect.objectContaining({
        code: row.code,
        unitPrice: '149.90',
        quantity: 10,
      }) as unknown,
    });

    const call = prisma.part.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(call.data).not.toHaveProperty('id');
    expect(call.data).not.toHaveProperty('createdAt');
  });

  it('deletes a part by its id', async () => {
    prisma.part.delete.mockResolvedValue(row);

    await repository.delete(row.id);

    expect(prisma.part.delete).toHaveBeenCalledWith({ where: { id: row.id } });
  });
});

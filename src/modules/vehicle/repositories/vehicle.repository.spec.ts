import { PrismaService } from '../../../shared/database/prisma.service';
import { Vehicle } from '../entities/vehicle.entity';
import { VehicleRepository } from './vehicle.repository';

const CLIENT_ID = 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

const row = {
  id: 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  clientId: CLIENT_ID,
  plate: 'ABC1D23',
  brand: 'Fiat',
  model: 'Argo',
  year: 2022,
  createdAt: new Date('2026-01-01T10:00:00.000Z'),
  updatedAt: new Date('2026-01-01T10:00:00.000Z'),
};

const makeVehicle = (plate = 'abc-1d23') =>
  Vehicle.create({
    clientId: CLIENT_ID,
    plate,
    brand: '  Fiat  ',
    model: 'Argo',
    year: 2022,
  });

describe('VehicleRepository', () => {
  let repository: VehicleRepository;
  let prisma: {
    vehicle: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      vehicle: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    repository = new VehicleRepository(prisma as unknown as PrismaService);
  });

  it('desembrulha os Value Objects ao gravar', async () => {
    prisma.vehicle.create.mockResolvedValue(row);

    await repository.create(makeVehicle());

    expect(prisma.vehicle.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: CLIENT_ID,
        plate: 'ABC1D23',
        brand: 'Fiat',
        year: 2022,
      }) as unknown,
    });
  });

  it('reconstrói a entidade a partir da linha do banco', async () => {
    prisma.vehicle.create.mockResolvedValue(row);

    const vehicle = await repository.create(makeVehicle());

    expect(vehicle.getId()).toBe(row.id);
    expect(vehicle.getPlate().getValue()).toBe('ABC1D23');
    expect(vehicle.getYear().getValue()).toBe(2022);
    expect(vehicle.getCreatedAt()).toEqual(row.createdAt);
  });

  it.each([
    ['findById', () => repository.findById(row.id), { id: row.id }],
    [
      'findByPlate',
      () => repository.findByPlate('ABC1D23'),
      { plate: 'ABC1D23' },
    ],
  ])('%s consulta pela chave correta', async (_label, act, where) => {
    prisma.vehicle.findUnique.mockResolvedValue(row);

    const vehicle = await act();

    expect(prisma.vehicle.findUnique).toHaveBeenCalledWith({ where });
    expect(vehicle?.getId()).toBe(row.id);
  });

  it.each([
    ['findById', () => repository.findById('x')],
    ['findByPlate', () => repository.findByPlate('x')],
  ])('%s retorna null quando não encontra', async (_label, act) => {
    prisma.vehicle.findUnique.mockResolvedValue(null);

    await expect(act()).resolves.toBeNull();
  });

  it('findAll sem filtro não restringe por cliente', async () => {
    prisma.vehicle.findMany.mockResolvedValue([row]);

    const vehicles = await repository.findAll();

    expect(prisma.vehicle.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: { createdAt: 'desc' },
    });
    expect(vehicles).toHaveLength(1);
  });

  it('findAll com clientId filtra pelo dono', async () => {
    prisma.vehicle.findMany.mockResolvedValue([]);

    await repository.findAll(CLIENT_ID);

    expect(prisma.vehicle.findMany).toHaveBeenCalledWith({
      where: { clientId: CLIENT_ID },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('update não envia placa nem dono, que são imutáveis', async () => {
    prisma.vehicle.update.mockResolvedValue(row);

    await repository.update(
      Vehicle.restore(row.id, {
        clientId: row.clientId,
        plate: row.plate,
        brand: row.brand,
        model: row.model,
        year: row.year,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }),
    );

    const call = prisma.vehicle.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(call.data).not.toHaveProperty('plate');
    expect(call.data).not.toHaveProperty('clientId');
  });

  it('delete remove pelo id', async () => {
    prisma.vehicle.delete.mockResolvedValue(row);

    await repository.delete(row.id);

    expect(prisma.vehicle.delete).toHaveBeenCalledWith({
      where: { id: row.id },
    });
  });
});

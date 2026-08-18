import { PrismaService } from '../../../shared/database/prisma.service';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderStatus } from '../enums/service-order-status.enum';
import { ServiceOrderRepository } from './service-order.repository';

const row = {
  id: 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
  clientId: 'aaaaaaaa-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
  vehicleId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
  description: 'Barulho no motor',
  status: 'RECEIVED',
  cancellationReason: null as string | null,
  completedAt: null as Date | null,
  createdAt: new Date('2026-01-01T10:00:00.000Z'),
  updatedAt: new Date('2026-01-01T10:00:00.000Z'),
};

describe('ServiceOrderRepository', () => {
  let repository: ServiceOrderRepository;
  let prisma: {
    serviceOrder: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      serviceOrder: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    repository = new ServiceOrderRepository(prisma as unknown as PrismaService);
  });

  it('grava os campos primitivos ao criar', async () => {
    prisma.serviceOrder.create.mockResolvedValue(row);
    const serviceOrder = ServiceOrder.create({
      clientId: row.clientId,
      vehicleId: row.vehicleId,
      description: '  Barulho no motor  ',
    });

    await repository.create(serviceOrder);

    expect(prisma.serviceOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: row.clientId,
        vehicleId: row.vehicleId,
        description: 'Barulho no motor',
        status: ServiceOrderStatus.RECEIVED,
        cancellationReason: null,
      }) as unknown,
    });
  });

  it('reconstrói a entidade a partir da linha do banco', async () => {
    prisma.serviceOrder.create.mockResolvedValue(row);

    const serviceOrder = await repository.create(
      ServiceOrder.create({
        clientId: row.clientId,
        vehicleId: row.vehicleId,
        description: row.description,
      }),
    );

    expect(serviceOrder.getId()).toBe(row.id);
    expect(serviceOrder.getStatus()).toBe(ServiceOrderStatus.RECEIVED);
    expect(serviceOrder.getCreatedAt()).toEqual(row.createdAt);
  });

  it('findById consulta pelo id e retorna null quando não encontra', async () => {
    prisma.serviceOrder.findUnique.mockResolvedValue(row);

    const found = await repository.findById(row.id);

    expect(prisma.serviceOrder.findUnique).toHaveBeenCalledWith({
      where: { id: row.id },
    });
    expect(found?.getId()).toBe(row.id);

    prisma.serviceOrder.findUnique.mockResolvedValue(null);
    await expect(repository.findById('x')).resolves.toBeNull();
  });

  it('findAll ordena do mais recente para o mais antigo', async () => {
    prisma.serviceOrder.findMany.mockResolvedValue([row]);

    const serviceOrders = await repository.findAll();

    expect(prisma.serviceOrder.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
    });
    expect(serviceOrders).toHaveLength(1);
    expect(serviceOrders[0].getId()).toBe(row.id);
  });

  it('update envia status, motivo de cancelamento, completedAt e updatedAt', async () => {
    const cancelledRow = {
      ...row,
      status: 'CANCELLED',
      cancellationReason: 'Cliente desistiu',
    };
    prisma.serviceOrder.update.mockResolvedValue(cancelledRow);

    const serviceOrder = ServiceOrder.restore(row.id, {
      clientId: row.clientId,
      vehicleId: row.vehicleId,
      description: row.description,
      status: ServiceOrderStatus.RECEIVED,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    serviceOrder.cancel('Cliente desistiu');

    await repository.update(serviceOrder);

    const call = prisma.serviceOrder.update.mock.calls[0][0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(call.where).toEqual({ id: row.id });
    expect(call.data).toEqual({
      status: 'CANCELLED',
      cancellationReason: 'Cliente desistiu',
      completedAt: null,
      updatedAt: serviceOrder.getUpdatedAt(),
    });
  });

  it('update envia completedAt quando a OS é finalizada', async () => {
    const completedRow = {
      ...row,
      status: 'COMPLETED',
      completedAt: new Date(),
    };
    prisma.serviceOrder.update.mockResolvedValue(completedRow);

    const serviceOrder = ServiceOrder.restore(row.id, {
      clientId: row.clientId,
      vehicleId: row.vehicleId,
      description: row.description,
      status: ServiceOrderStatus.IN_PROGRESS,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    serviceOrder.complete();

    await repository.update(serviceOrder);

    const call = prisma.serviceOrder.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.completedAt).toBeInstanceOf(Date);
  });
});

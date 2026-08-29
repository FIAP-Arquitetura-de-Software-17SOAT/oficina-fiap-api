import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { Service } from '../entities/service.entity';
import { ServiceRepository } from './service.repository';
import { Money } from '../../../shared/domain/value-objects/money.vo';

const row = {
  id: 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
  name: 'Troca de óleo',
  description: 'Sintético',
  priceCents: 14990,
  createdAt: new Date('2026-01-01T10:00:00.000Z'),
  updatedAt: new Date('2026-01-01T10:00:00.000Z'),
};

const uniqueViolation = { code: 'P2002', meta: { target: ['name'] } };

const makeService = () =>
  Service.create({
    name: 'Troca de óleo',
    description: 'Sintético',
    price: Money.fromDecimal(149.9),
  });

describe('ServiceRepository', () => {
  let repository: ServiceRepository;
  let prisma: {
    service: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      service: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    repository = new ServiceRepository(prisma as unknown as PrismaService);
  });

  it('persiste o preço em centavos inteiros', async () => {
    prisma.service.create.mockResolvedValue(row);
    const service = makeService();

    await repository.create(service);

    expect(prisma.service.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: service.getId(),
        name: 'Troca de óleo',
        description: 'Sintético',
        priceCents: 14990,
      }),
    });
  });

  it('traduz P2002 do insert em 409', async () => {
    prisma.service.create.mockRejectedValue(uniqueViolation);

    await expect(repository.create(makeService())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('propaga erro desconhecido do insert', async () => {
    prisma.service.create.mockRejectedValue(new Error('boom'));

    await expect(repository.create(makeService())).rejects.toThrow('boom');
  });

  it('reconstrói a entidade a partir dos centavos', async () => {
    prisma.service.findUnique.mockResolvedValue(row);

    const service = await repository.findById(row.id);

    expect(service?.getId()).toBe(row.id);
    expect(service?.getPrice().value).toBe(149.9);
  });

  it('devolve null quando não encontra por id', async () => {
    prisma.service.findUnique.mockResolvedValue(null);

    await expect(repository.findById('missing')).resolves.toBeNull();
  });

  it('busca por nome', async () => {
    prisma.service.findUnique.mockResolvedValue(row);

    const service = await repository.findByName('Troca de óleo');

    expect(prisma.service.findUnique).toHaveBeenCalledWith({
      where: { name: 'Troca de óleo' },
    });
    expect(service?.getName()).toBe('Troca de óleo');
  });

  it('devolve null quando não encontra por nome', async () => {
    prisma.service.findUnique.mockResolvedValue(null);

    await expect(repository.findByName('missing')).resolves.toBeNull();
  });

  it('lista do mais recente para o mais antigo', async () => {
    prisma.service.findMany.mockResolvedValue([row]);

    const services = await repository.findAll();

    expect(prisma.service.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
    });
    expect(services).toHaveLength(1);
  });

  it('atualiza mandando descrição nula quando ausente', async () => {
    prisma.service.update.mockResolvedValue({ ...row, description: null });
    const service = Service.create({
      name: 'Alinhamento',
      price: Money.fromDecimal(80),
    });

    await repository.update(service);

    expect(prisma.service.update).toHaveBeenCalledWith({
      where: { id: service.getId() },
      data: expect.objectContaining({ description: null, priceCents: 8000 }),
    });
  });

  it('traduz P2002 do update em 409', async () => {
    prisma.service.update.mockRejectedValue(uniqueViolation);

    await expect(repository.update(makeService())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('propaga erro desconhecido do update', async () => {
    prisma.service.update.mockRejectedValue(new Error('boom'));

    await expect(repository.update(makeService())).rejects.toThrow('boom');
  });

  it('remove por id', async () => {
    prisma.service.delete.mockResolvedValue(row);

    await repository.delete(row.id);

    expect(prisma.service.delete).toHaveBeenCalledWith({
      where: { id: row.id },
    });
  });
});

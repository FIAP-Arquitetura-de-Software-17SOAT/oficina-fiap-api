import { PrismaService } from '../../../shared/database/prisma.service';
import { Client } from '../entities/client.entity';
import { ClientRepository } from './client.repository';

const VALID_CPF = '52998224725';

const row = {
  id: 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
  name: 'Maria Silva',
  document: VALID_CPF,
  email: 'maria@example.com',
  phone: '11999998888',
  createdAt: new Date('2026-01-01T10:00:00.000Z'),
  updatedAt: new Date('2026-01-01T10:00:00.000Z'),
};

describe('ClientRepository', () => {
  let repository: ClientRepository;
  let prisma: {
    client: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      client: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    repository = new ClientRepository(prisma as unknown as PrismaService);
  });

  it('desembrulha os Value Objects ao gravar', async () => {
    prisma.client.create.mockResolvedValue(row);
    const client = Client.create({
      name: 'Maria Silva',
      document: '529.982.247-25',
      email: 'MARIA@example.com',
      phone: '(11) 99999-8888',
    });

    await repository.create(client);

    expect(prisma.client.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        document: VALID_CPF,
        email: 'maria@example.com',
        phone: '11999998888',
      }) as unknown,
    });
  });

  it('reconstrói a entidade a partir da linha do banco', async () => {
    prisma.client.create.mockResolvedValue(row);

    const client = await repository.create(
      Client.create({
        name: 'Maria Silva',
        document: VALID_CPF,
        email: 'maria@example.com',
        phone: '11999998888',
      }),
    );

    expect(client.getId()).toBe(row.id);
    expect(client.getDocument().getValue()).toBe(VALID_CPF);
    expect(client.getCreatedAt()).toEqual(row.createdAt);
  });

  it.each([
    ['findById', () => repository.findById(row.id), { id: row.id }],
    [
      'findByDocument',
      () => repository.findByDocument(VALID_CPF),
      { document: VALID_CPF },
    ],
    [
      'findByEmail',
      () => repository.findByEmail(row.email),
      { email: row.email },
    ],
  ])('%s consulta pela chave correta', async (_label, act, where) => {
    prisma.client.findUnique.mockResolvedValue(row);

    const client = await act();

    expect(prisma.client.findUnique).toHaveBeenCalledWith({ where });
    expect(client?.getId()).toBe(row.id);
  });

  it.each([
    ['findById', () => repository.findById('x')],
    ['findByDocument', () => repository.findByDocument('x')],
    ['findByEmail', () => repository.findByEmail('x')],
  ])('%s retorna null quando não encontra', async (_label, act) => {
    prisma.client.findUnique.mockResolvedValue(null);

    await expect(act()).resolves.toBeNull();
  });

  it('findAll ordena do mais recente para o mais antigo', async () => {
    prisma.client.findMany.mockResolvedValue([row]);

    const clients = await repository.findAll();

    expect(prisma.client.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
    });
    expect(clients).toHaveLength(1);
    expect(clients[0].getEmail().getValue()).toBe(row.email);
  });

  it('update não envia o documento, que é imutável', async () => {
    prisma.client.update.mockResolvedValue(row);
    const client = Client.restore(row.id, {
      name: row.name,
      document: row.document,
      email: row.email,
      phone: row.phone,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });

    await repository.update(client);

    const call = prisma.client.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(call.data).not.toHaveProperty('document');
  });

  it('delete remove pelo id', async () => {
    prisma.client.delete.mockResolvedValue(row);

    await repository.delete(row.id);

    expect(prisma.client.delete).toHaveBeenCalledWith({
      where: { id: row.id },
    });
  });
});

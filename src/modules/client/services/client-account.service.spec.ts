import { ConflictException, NotFoundException } from '@nestjs/common';
import { User } from '../../../shared/identity/entities/user.entity';
import { Client } from '../entities/client.entity';
import { ClientAccountService } from './client-account.service';

const makeClient = () =>
  Client.create({
    name: 'Maria Silva',
    document: '52998224725',
    email: 'Maria@Example.com',
    phone: '11999998888',
  });

describe('ClientAccountService', () => {
  let service: ClientAccountService;
  let clients: { findById: jest.Mock };
  let users: {
    findByEmail: jest.Mock;
    findByClientId: jest.Mock;
    create: jest.Mock;
  };
  let passwordHash: { hash: jest.Mock };

  beforeEach(() => {
    clients = { findById: jest.fn() };
    users = {
      findByEmail: jest.fn().mockResolvedValue(null),
      findByClientId: jest.fn().mockResolvedValue(null),
      create: jest.fn((user: User) => Promise.resolve(user)),
    };
    passwordHash = { hash: jest.fn().mockResolvedValue('$2b$12$hash') };
    service = new ClientAccountService(
      clients as never,
      users as never,
      passwordHash as never,
    );
  });

  it('cria o login CUSTOMER com o email do cliente e a senha com hash', async () => {
    const client = makeClient();
    clients.findById.mockResolvedValue(client);

    const user = await service.createAccount(client.getId(), {
      password: 'senha-forte-123',
    });

    expect(passwordHash.hash).toHaveBeenCalledWith('senha-forte-123');
    expect(user.getRole()).toBe('CUSTOMER');
    expect(user.getClientId()).toBe(client.getId());
    expect(user.getEmail()).toBe('maria@example.com');
    expect(user.getPasswordHash()).toBe('$2b$12$hash');
  });

  it('404 quando o cliente não existe', async () => {
    clients.findById.mockResolvedValue(null);

    await expect(
      service.createAccount('x', { password: 'senha-forte-123' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('409 quando o cliente já tem login', async () => {
    const client = makeClient();
    clients.findById.mockResolvedValue(client);
    users.findByClientId.mockResolvedValue({});

    await expect(
      service.createAccount(client.getId(), { password: 'senha-forte-123' }),
    ).rejects.toThrow(ConflictException);
    expect(users.create).not.toHaveBeenCalled();
  });

  it('409 quando o email do cliente já é login de outra pessoa', async () => {
    const client = makeClient();
    clients.findById.mockResolvedValue(client);
    users.findByEmail.mockResolvedValue({});

    await expect(
      service.createAccount(client.getId(), { password: 'senha-forte-123' }),
    ).rejects.toThrow(ConflictException);
    expect(users.findByEmail).toHaveBeenCalledWith('maria@example.com');
  });
});

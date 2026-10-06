import { Test, TestingModule } from '@nestjs/testing';
import { Client } from '../../domain/entities/client.entity';
import { User } from '../../../../shared/identity/domain/entities/user.entity';
import { CreateClientUseCase } from '../../application/use-cases/create-client.use-case';
import { FindClientUseCase } from '../../application/use-cases/find-client.use-case';
import { ListClientsUseCase } from '../../application/use-cases/list-clients.use-case';
import { UpdateClientUseCase } from '../../application/use-cases/update-client.use-case';
import { DeleteClientUseCase } from '../../application/use-cases/delete-client.use-case';
import { CreateClientAccountUseCase } from '../../application/use-cases/create-client-account.use-case';
import { ClientController } from './client.controller';

const VALID_CPF = '52998224725';

const makeClient = (email = 'maria@example.com') =>
  Client.create({
    name: 'Maria Silva',
    document: VALID_CPF,
    email,
    phone: '11999998888',
  });

describe('ClientController', () => {
  let controller: ClientController;
  let service: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let accounts: { createAccount: jest.Mock };

  beforeEach(async () => {
    accounts = { createAccount: jest.fn() };
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientController],
      providers: [
        { provide: CreateClientUseCase, useValue: { execute: service.create } },
        { provide: FindClientUseCase, useValue: { execute: service.findById } },
        { provide: ListClientsUseCase, useValue: { execute: service.findAll } },
        { provide: UpdateClientUseCase, useValue: { execute: service.update } },
        { provide: DeleteClientUseCase, useValue: { execute: service.delete } },
        {
          provide: CreateClientAccountUseCase,
          useValue: { execute: accounts.createAccount },
        },
      ],
    }).compile();

    controller = module.get<ClientController>(ClientController);
  });

  it('create devolve o DTO com os Value Objects desembrulhados', async () => {
    const client = makeClient();
    service.create.mockResolvedValue(client);
    const dto = {
      name: 'Maria Silva',
      document: VALID_CPF,
      email: 'maria@example.com',
      phone: '11999998888',
    };

    const response = await controller.create(dto);

    expect(service.create).toHaveBeenCalledWith(dto);
    expect(response.document).toBe(VALID_CPF);
    expect(response.email).toBe('maria@example.com');
  });

  it('findAll mapeia a lista inteira', async () => {
    service.findAll.mockResolvedValue([
      makeClient('a@example.com'),
      makeClient('b@example.com'),
    ]);

    const response = await controller.findAll();

    expect(response.map((c) => c.email)).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
  });

  it('findById delega o id para o service', async () => {
    const client = makeClient();
    service.findById.mockResolvedValue(client);

    const response = await controller.findById(client.getId());

    expect(service.findById).toHaveBeenCalledWith(client.getId());
    expect(response.id).toBe(client.getId());
  });

  it('update repassa id e dto', async () => {
    const client = makeClient();
    service.update.mockResolvedValue(client);

    await controller.update(client.getId(), { name: 'Maria Souza' });

    expect(service.update).toHaveBeenCalledWith(client.getId(), {
      name: 'Maria Souza',
    });
  });

  it('delete não devolve corpo', async () => {
    service.delete.mockResolvedValue(undefined);

    await expect(controller.delete('id')).resolves.toBeUndefined();
    expect(service.delete).toHaveBeenCalledWith('id');
  });

  it('createAccount devolve o login criado, sem a senha', async () => {
    const user = User.createCustomer({
      email: 'maria@example.com',
      passwordHash: '$2b$12$hash',
      clientId: 'client-id',
    });
    accounts.createAccount.mockResolvedValue({
      id: user.getId(),
      email: user.getEmail(),
      role: user.getRole(),
      clientId: user.getClientId(),
      createdAt: user.getCreatedAt(),
    });

    const response = await controller.createAccount('client-id', {
      password: 'senha-forte-123',
    });

    expect(accounts.createAccount).toHaveBeenCalledWith('client-id', {
      password: 'senha-forte-123',
    });
    expect(response).toEqual({
      id: user.getId(),
      email: 'maria@example.com',
      role: 'CUSTOMER',
      clientId: 'client-id',
      createdAt: user.getCreatedAt(),
    });
  });
});

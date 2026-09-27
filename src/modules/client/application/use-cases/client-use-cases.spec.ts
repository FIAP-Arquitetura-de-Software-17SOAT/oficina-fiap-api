import { InMemoryClientRepository } from '../../../../../test/in-memory-client.repository';
import { DomainException } from '../../../../shared/domain/domain.exception';
import { ClientApplicationError } from '../errors/client-application.error';
import { CreateClientUseCase } from './create-client.use-case';
import { FindClientUseCase } from './find-client.use-case';
import { ListClientsUseCase } from './list-clients.use-case';
import { UpdateClientUseCase } from './update-client.use-case';
import { DeleteClientUseCase } from './delete-client.use-case';
import { CreateClientAccountUseCase } from './create-client-account.use-case';

const input = {
  name: 'Maria Silva',
  document: '529.982.247-25',
  email: 'Maria@Example.com',
  phone: '(11) 99999-8888',
};

describe('Client use cases without Nest', () => {
  let repository: InMemoryClientRepository;
  let create: CreateClientUseCase;
  beforeEach(() => {
    repository = new InMemoryClientRepository();
    create = new CreateClientUseCase(repository);
  });

  it('normalizes and persists a client using only the repository port', async () => {
    const client = await create.execute(input);
    expect(client.getDocument().getValue()).toBe('52998224725');
    expect(client.getEmail().getValue()).toBe('maria@example.com');
    expect(client.getPhone()).toBe('11999998888');
    expect(
      await new FindClientUseCase(repository).execute(client.getId()),
    ).toBe(client);
    expect(await new ListClientsUseCase(repository).execute()).toEqual([
      client,
    ]);
  });

  it('rejects a duplicate normalized document with a framework-free error', async () => {
    await create.execute(input);
    await expect(
      create.execute({ ...input, document: '52998224725' }),
    ).rejects.toMatchObject({
      code: 'CLIENT_ALREADY_EXISTS',
      message: 'Client already exists',
    });
  });

  it('rejects a duplicate normalized email', async () => {
    await create.execute(input);
    await expect(
      create.execute({
        ...input,
        document: '11144477735',
        email: 'maria@example.com',
      }),
    ).rejects.toMatchObject({ code: 'CLIENT_EMAIL_IN_USE' });
  });

  it('does not persist invalid domain input', async () => {
    await expect(
      create.execute({ ...input, document: '12345678900' }),
    ).rejects.toThrow(DomainException);
    expect(await repository.findAll()).toEqual([]);
  });

  it('updates only supplied fields and permits the same normalized email', async () => {
    const client = await create.execute(input);
    const update = new UpdateClientUseCase(repository);
    const result = await update.execute(client.getId(), {
      name: 'Maria Souza',
      email: 'MARIA@example.com',
    });
    expect(result.getName()).toBe('Maria Souza');
    expect(result.getDocument().getValue()).toBe('52998224725');
    expect(result.getPhone()).toBe('11999998888');
    expect((await repository.findById(client.getId()))?.getName()).toBe(
      'Maria Souza',
    );
  });

  it('rejects changing email to another client email', async () => {
    const client = await create.execute(input);
    await create.execute({
      ...input,
      document: '11144477735',
      email: 'joao@example.com',
    });
    await expect(
      new UpdateClientUseCase(repository).execute(client.getId(), {
        email: 'joao@example.com',
      }),
    ).rejects.toMatchObject({ code: 'CLIENT_EMAIL_IN_USE' });
    expect(client.getEmail().getValue()).toBe('maria@example.com');
  });

  it('deletes an existing client', async () => {
    const client = await create.execute(input);
    await new DeleteClientUseCase(repository).execute(client.getId());
    expect(await repository.findById(client.getId())).toBeNull();
  });

  it('uses the same not-found error for read, update and delete', async () => {
    const operations = [
      () => new FindClientUseCase(repository).execute('missing'),
      () =>
        new UpdateClientUseCase(repository).execute('missing', {
          name: 'Maria',
        }),
      () => new DeleteClientUseCase(repository).execute('missing'),
    ];
    for (const operation of operations) {
      await expect(operation()).rejects.toBeInstanceOf(ClientApplicationError);
      await expect(operation()).rejects.toMatchObject({
        code: 'CLIENT_NOT_FOUND',
        message: 'Client not found',
      });
    }
  });

  describe('account creation', () => {
    let identity: {
      findByClientId: jest.Mock;
      findByEmail: jest.Mock;
      createCustomer: jest.Mock;
    };
    let account: CreateClientAccountUseCase;
    beforeEach(() => {
      identity = {
        findByClientId: jest.fn().mockResolvedValue(null),
        findByEmail: jest.fn().mockResolvedValue(null),
        createCustomer: jest.fn().mockResolvedValue({
          id: 'user-id',
          email: 'maria@example.com',
          role: 'CUSTOMER',
          clientId: 'client-id',
          createdAt: new Date('2026-01-01'),
        }),
      };
      account = new CreateClientAccountUseCase(repository, identity);
    });

    it('uses the registered email and returns a safe account contract', async () => {
      const client = await create.execute(input);
      const result = await account.execute(client.getId(), {
        password: 'senha-forte-123',
      });
      expect(identity.createCustomer).toHaveBeenCalledWith({
        clientId: client.getId(),
        email: 'maria@example.com',
        password: 'senha-forte-123',
      });
      expect(result).toMatchObject({ id: 'user-id', role: 'CUSTOMER' });
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('password');
    });

    it('rejects an unknown client before contacting identity', async () => {
      await expect(
        account.execute('missing', { password: 'senha-forte-123' }),
      ).rejects.toMatchObject({ code: 'CLIENT_NOT_FOUND' });
      expect(identity.findByClientId).not.toHaveBeenCalled();
      expect(identity.createCustomer).not.toHaveBeenCalled();
    });

    it.each([
      [
        'findByClientId',
        'CLIENT_ACCOUNT_EXISTS',
        'Client already has an account',
      ],
      [
        'findByEmail',
        'CLIENT_ACCOUNT_EMAIL_IN_USE',
        'E-mail already used by another account',
      ],
    ] as const)(
      'rejects an existing identity from %s',
      async (method, code, message) => {
        const client = await create.execute(input);
        identity[method].mockResolvedValue({ id: 'existing' });
        await expect(
          account.execute(client.getId(), { password: 'senha-forte-123' }),
        ).rejects.toMatchObject({ code, message });
        expect(identity.createCustomer).not.toHaveBeenCalled();
      },
    );
  });
});

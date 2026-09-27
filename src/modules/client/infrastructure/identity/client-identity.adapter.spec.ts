import { User } from '../../../../shared/identity/entities/user.entity';
import { UserRepository } from '../../../../shared/identity/repositories/user.repository';
import { PasswordHashService } from '../../../../shared/identity/services/password-hash.service';
import { ClientIdentityAdapter } from './client-identity.adapter';

describe('ClientIdentityAdapter', () => {
  const createdAt = new Date('2026-01-01');
  const user = User.restore('user-id', {
    email: 'maria@example.com',
    passwordHash: 'stored-hash',
    role: 'CUSTOMER',
    clientId: 'client-id',
    createdAt,
    updatedAt: createdAt,
  });
  const users = {
    findByClientId: jest.fn(),
    findByEmail: jest.fn(),
    create: jest.fn(),
  };
  const hash = { hash: jest.fn() };
  let adapter: ClientIdentityAdapter;
  beforeEach(() => {
    jest.resetAllMocks();
    adapter = new ClientIdentityAdapter(
      users as unknown as UserRepository,
      hash as unknown as PasswordHashService,
    );
  });

  it.each(['findByClientId', 'findByEmail'] as const)(
    '%s exposes only identity existence',
    async (method) => {
      users[method].mockResolvedValue(user);
      expect(await adapter[method]('lookup')).toEqual({ id: 'user-id' });
      expect(users[method]).toHaveBeenCalledWith('lookup');
      users[method].mockResolvedValue(null);
      expect(await adapter[method]('missing')).toBeNull();
    },
  );

  it('hashes the password before persistence and returns no credential material', async () => {
    hash.hash.mockResolvedValue('hashed-password');
    users.create.mockImplementation((created: User) =>
      Promise.resolve(created),
    );
    const result = await adapter.createCustomer({
      clientId: 'client-id',
      email: 'maria@example.com',
      password: 'plain-password',
    });
    const persisted = users.create.mock.calls[0][0] as User;
    expect(hash.hash).toHaveBeenCalledWith('plain-password');
    expect(persisted.getPasswordHash()).toBe('hashed-password');
    expect(persisted.getRole()).toBe('CUSTOMER');
    expect(persisted.getClientId()).toBe('client-id');
    expect(result).toEqual({
      id: persisted.getId(),
      email: 'maria@example.com',
      role: 'CUSTOMER',
      clientId: 'client-id',
      createdAt: persisted.getCreatedAt(),
    });
  });

  it('does not persist when hashing fails', async () => {
    hash.hash.mockRejectedValue(new Error('hash failed'));
    await expect(
      adapter.createCustomer({
        clientId: 'client-id',
        email: 'maria@example.com',
        password: 'plain-password',
      }),
    ).rejects.toThrow('hash failed');
    expect(users.create).not.toHaveBeenCalled();
  });
});

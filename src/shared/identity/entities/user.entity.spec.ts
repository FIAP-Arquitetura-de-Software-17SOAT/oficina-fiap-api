import { User } from './user.entity';

describe('User', () => {
  it('restores a user from its persisted identity fields', () => {
    const createdAt = new Date('2026-08-13T12:00:00.000Z');
    const updatedAt = new Date('2026-08-13T13:00:00.000Z');
    const user = User.restore('user-id', {
      email: 'admin@example.com',
      passwordHash: '$2b$12$hash',
      role: 'ADMIN',
      createdAt,
      updatedAt,
    });

    expect(user.getId()).toBe('user-id');
    expect(user.getEmail()).toBe('admin@example.com');
    expect(user.getPasswordHash()).toBe('$2b$12$hash');
    expect(user.getRole()).toBe('ADMIN');
    expect(user.getCreatedAt()).toEqual(createdAt);
    expect(user.getUpdatedAt()).toEqual(updatedAt);
  });
});

describe('User CUSTOMER', () => {
  it('cria o login do cliente com o cliente vinculado', () => {
    const user = User.createCustomer({
      email: 'maria@example.com',
      passwordHash: '$2b$12$hash',
      clientId: 'client-id',
    });

    expect(user.getRole()).toBe('CUSTOMER');
    expect(user.getClientId()).toBe('client-id');
  });

  it('usuário da oficina não tem cliente', () => {
    const user = User.create({ email: 'a@example.com', passwordHash: 'h' });

    expect(user.getClientId()).toBeNull();
  });

  it('recusa CUSTOMER sem cliente', () => {
    expect(() =>
      User.create({
        email: 'a@example.com',
        passwordHash: 'h',
        role: 'CUSTOMER',
      }),
    ).toThrow('Login de cliente precisa estar vinculado a um cliente');
  });

  it('recusa cliente vinculado a usuário da oficina', () => {
    expect(() =>
      User.create({
        email: 'a@example.com',
        passwordHash: 'h',
        role: 'EMPLOYEE',
        clientId: 'client-id',
      }),
    ).toThrow('Só o login de cliente é vinculado a um cliente');
  });
});

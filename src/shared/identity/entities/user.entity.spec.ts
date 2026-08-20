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

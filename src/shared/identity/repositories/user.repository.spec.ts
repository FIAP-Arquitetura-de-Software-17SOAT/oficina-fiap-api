import { PrismaService } from '../../database/prisma.service';
import { UserRepository } from './user.repository';

const row = {
  id: 'user-id',
  email: 'admin@example.com',
  passwordHash: '$2b$12$hash',
  role: 'ADMIN' as const,
  createdAt: new Date('2026-08-13T12:00:00.000Z'),
  updatedAt: new Date('2026-08-13T12:00:00.000Z'),
};

describe('UserRepository', () => {
  let repository: UserRepository;
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    repository = new UserRepository(prisma as unknown as PrismaService);
  });

  it.each([
    ['findByEmail', () => repository.findByEmail(row.email), { email: row.email }],
    ['findById', () => repository.findById(row.id), { id: row.id }],
  ])('%s maps the found persistence row to a user', async (_label, act, where) => {
    prisma.user.findUnique.mockResolvedValue(row);

    const user = await act();

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where });
    expect(user).toMatchObject({
      getId: expect.any(Function),
      getEmail: expect.any(Function),
    });
    expect(user?.getId()).toBe(row.id);
    expect(user?.getEmail()).toBe(row.email);
  });

  it('returns null when a user is not found by email', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(repository.findByEmail(row.email)).resolves.toBeNull();
  });
});

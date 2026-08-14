import { seedAdmin } from './seed';

describe('seedAdmin', () => {
  const env = {
    ADMIN_EMAIL: 'Admin@Example.com',
    ADMIN_PASSWORD: 'secret',
  };

  const hash = jest.fn().mockResolvedValue('$2b$12$hashed-password');
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'admin-id' });
  });

  it('creates an ADMIN once with a normalized email', async () => {
    await seedAdmin(prisma, env, hash);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'admin@example.com' },
    });
    expect(hash).toHaveBeenCalledWith('secret');
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'admin@example.com',
        passwordHash: '$2b$12$hashed-password',
        role: 'ADMIN',
      },
    });
  });

  it('does not overwrite an existing administrator', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

    await seedAdmin(prisma, env, hash);

    expect(hash).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('hashes the configured password without modifying it', async () => {
    await seedAdmin(
      prisma,
      { ...env, ADMIN_PASSWORD: ' secret with spaces ' },
      hash,
    );

    expect(hash).toHaveBeenCalledWith(' secret with spaces ');
  });
});

import { seedAdmin } from './seed';

describe('seedAdmin', () => {
  const env = {
    ADMIN_EMAIL: 'Admin@Example.com',
    ADMIN_PASSWORD: 'correct-password',
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
    expect(hash).toHaveBeenCalledWith('correct-password');
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

  it('treats a concurrent unique-email create as already seeded', async () => {
    prisma.user.create.mockRejectedValueOnce({ code: 'P2002' });

    await expect(seedAdmin(prisma, env, hash)).resolves.toBeUndefined();

    expect(prisma.user.create).toHaveBeenCalledTimes(1);
  });

  it('hashes the configured password without modifying it', async () => {
    await seedAdmin(
      prisma,
      { ...env, ADMIN_PASSWORD: ' secret with spaces ' },
      hash,
    );

    expect(hash).toHaveBeenCalledWith(' secret with spaces ');
  });

  it('rejects an invalid normalized administrator email before querying', async () => {
    await expect(
      seedAdmin(prisma, { ...env, ADMIN_EMAIL: ' Not an email ' }, hash),
    ).rejects.toThrow('ADMIN_EMAIL must be a valid email address');

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it.each([
    ['fewer than 8 characters', 'short'],
    ['more than 72 characters', 'a'.repeat(73)],
    ['more than 72 UTF-8 bytes', `${'é'.repeat(32)}123456789`],
  ])('rejects a password with %s before querying', async (_case, password) => {
    await expect(
      seedAdmin(prisma, { ...env, ADMIN_PASSWORD: password }, hash),
    ).rejects.toThrow(
      'ADMIN_PASSWORD must be 8 to 72 characters and at most 72 UTF-8 bytes',
    );

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('accepts a password at the 72-byte UTF-8 bcrypt boundary', async () => {
    const password = `${'é'.repeat(32)}12345678`;

    expect(Buffer.byteLength(password, 'utf8')).toBe(72);

    await seedAdmin(prisma, { ...env, ADMIN_PASSWORD: password }, hash);

    expect(hash).toHaveBeenCalledWith(password);
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
  });
});

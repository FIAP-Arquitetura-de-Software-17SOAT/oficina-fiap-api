import { PrismaService } from '../../database/prisma.service';
import { RefreshSession } from '../entities/refresh-session.entity';
import { RefreshSessionRepository } from './refresh-session.repository';

const row = {
  id: 'session-id',
  jti: 'session-jti',
  tokenHash: '$2b$12$hashed-refresh-token',
  expiresAt: new Date('2026-08-14T12:00:00.000Z'),
  revokedAt: null,
  userId: 'user-id',
  createdAt: new Date('2026-08-13T12:00:00.000Z'),
  updatedAt: new Date('2026-08-13T12:00:00.000Z'),
};

describe('RefreshSessionRepository', () => {
  let repository: RefreshSessionRepository;
  let prisma: {
    refreshSession: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      refreshSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    repository = new RefreshSessionRepository(
      prisma as unknown as PrismaService,
    );
  });

  it('persists the refresh token hash without a plaintext token', async () => {
    prisma.refreshSession.create.mockResolvedValue(row);
    const session = RefreshSession.restore(row.id, row);

    await repository.create(session);

    const data = prisma.refreshSession.create.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(row.tokenHash);
    expect(data).not.toHaveProperty('token');
  });

  it('finds a session by jti and maps it to a domain entity', async () => {
    prisma.refreshSession.findUnique.mockResolvedValue(row);

    const session = await repository.findByJti(row.jti);

    expect(prisma.refreshSession.findUnique).toHaveBeenCalledWith({
      where: { jti: row.jti },
    });
    expect(session?.getTokenHash()).toBe(row.tokenHash);
  });

  it('records the supplied revocation timestamp for the jti', async () => {
    const revokedAt = new Date('2026-08-13T13:00:00.000Z');
    prisma.refreshSession.update.mockResolvedValue({ ...row, revokedAt });

    await repository.revoke(row.jti, revokedAt);

    expect(prisma.refreshSession.update).toHaveBeenCalledWith({
      where: { jti: row.jti },
      data: { revokedAt },
    });
  });
});

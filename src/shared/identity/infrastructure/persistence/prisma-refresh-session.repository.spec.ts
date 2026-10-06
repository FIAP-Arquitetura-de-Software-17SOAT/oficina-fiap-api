import { PrismaService } from '../../../database/prisma.service';
import { RefreshSession } from '../../domain/entities/refresh-session.entity';
import { PrismaRefreshSessionRepository } from './prisma-refresh-session.repository';

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

describe('PrismaRefreshSessionRepository', () => {
  let repository: PrismaRefreshSessionRepository;
  let prisma: {
    refreshSession: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      refreshSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((operation: (tx: unknown) => unknown) =>
        operation(prisma),
      ),
    };
    repository = new PrismaRefreshSessionRepository(
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

  it('rotates: revokes the live session and creates the replacement in one transaction', async () => {
    const revokedAt = new Date('2026-08-13T13:00:00.000Z');
    const { id, ...props } = row;
    expect(id).toBe('session-id');
    const replacement = RefreshSession.restore('next-id', {
      ...props,
      jti: 'next-jti',
    });
    prisma.refreshSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.refreshSession.create.mockResolvedValue({});

    await expect(
      repository.rotate(row.jti, revokedAt, replacement),
    ).resolves.toBe(true);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { jti: row.jti, revokedAt: null, expiresAt: { gt: revokedAt } },
      data: { revokedAt },
    });
    expect(prisma.refreshSession.create.mock.calls[0][0].data).toMatchObject({
      jti: 'next-jti',
      tokenHash: row.tokenHash,
    });
  });

  it('does not create a replacement when the consumed session was not live', async () => {
    prisma.refreshSession.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.rotate(row.jti, new Date(), RefreshSession.restore('x', row)),
    ).resolves.toBe(false);
    expect(prisma.refreshSession.create).not.toHaveBeenCalled();
  });
});

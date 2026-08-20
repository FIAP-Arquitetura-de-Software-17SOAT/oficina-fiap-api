import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { AuthService, AuthTokenPayload, readJwtSettings } from './auth.service';
import { User } from '../../../shared/identity/entities/user.entity';
import { RefreshSession } from '../../../shared/identity/entities/refresh-session.entity';
import { PasswordHashService } from '../../../shared/identity/services/password-hash.service';

const ACCESS_SECRET = 'access-secret-for-tests';
const REFRESH_SECRET = 'refresh-secret-for-tests';
const PASSWORD = 'correct-horse-battery-staple';

const refreshTokenDigest = (token: string): string =>
  createHash('sha256').update(token).digest('base64url');

class InMemoryRefreshSessionRepository {
  readonly sessions = new Map<string, RefreshSession>();

  create(session: RefreshSession): Promise<RefreshSession> {
    this.sessions.set(session.getJti(), session);
    return Promise.resolve(session);
  }

  findByJti(jti: string): Promise<RefreshSession | null> {
    return Promise.resolve(this.sessions.get(jti) ?? null);
  }

  revoke(jti: string, revokedAt: Date): Promise<void> {
    this.sessions.get(jti)?.revoke(revokedAt);
    return Promise.resolve();
  }
}

class InMemoryPrisma {
  transactionCalls = 0;

  constructor(private readonly sessions: Map<string, RefreshSession>) {}

  readonly refreshSession = {
    updateMany: (args: {
      where: {
        jti: string;
        revokedAt: null;
        expiresAt: { gt: Date };
      };
      data: { revokedAt: Date };
    }): Promise<{ count: number }> => {
      const session = this.sessions.get(args.where.jti);

      if (
        !session ||
        session.isRevoked() ||
        session.isExpired(args.where.expiresAt.gt)
      ) {
        return Promise.resolve({ count: 0 });
      }

      session.revoke(args.data.revokedAt);
      return Promise.resolve({ count: 1 });
    },
    create: (args: {
      data: {
        id: string;
        jti: string;
        tokenHash: string;
        expiresAt: Date;
        userId: string;
      };
    }): Promise<void> => {
      this.sessions.set(
        args.data.jti,
        RefreshSession.restore(args.data.id, {
          ...args.data,
          revokedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );
      return Promise.resolve();
    },
  };

  async $transaction<T>(operation: (prisma: this) => Promise<T>): Promise<T> {
    this.transactionCalls += 1;
    return operation(this);
  }
}

describe('AuthService', () => {
  let service: AuthService;
  let jwt: JwtService;
  let passwordHash: PasswordHashService;
  let sessions: InMemoryRefreshSessionRepository;
  let prisma: InMemoryPrisma;

  beforeEach(async () => {
    passwordHash = new PasswordHashService();
    const user = User.restore('admin-id', {
      email: 'admin@example.com',
      passwordHash: await passwordHash.hash(PASSWORD),
      role: 'ADMIN',
      createdAt: new Date('2026-08-13T12:00:00.000Z'),
      updatedAt: new Date('2026-08-13T12:00:00.000Z'),
    });
    sessions = new InMemoryRefreshSessionRepository();
    prisma = new InMemoryPrisma(sessions.sessions);
    jwt = new JwtService({ secret: ACCESS_SECRET });
    service = new AuthService(
      {
        findByEmail: jest.fn().mockResolvedValue(user),
        findById: jest.fn().mockResolvedValue(user),
      } as never,
      sessions as never,
      passwordHash,
      jwt,
      {
        get: jest.fn(
          (key: string) =>
            (
              ({
                JWT_ACCESS_SECRET: ACCESS_SECRET,
                JWT_ACCESS_TTL: '15m',
                JWT_REFRESH_SECRET: REFRESH_SECRET,
                JWT_REFRESH_TTL: '7d',
              }) as Record<string, string>
            )[key],
        ),
      } as never,
      prisma as never,
    );
  });

  it('returns signed access and refresh tokens for valid credentials', async () => {
    const tokens = await service.login({
      email: 'admin@example.com',
      password: PASSWORD,
    });
    const access = await jwt.verifyAsync<AuthTokenPayload>(tokens.accessToken, {
      secret: ACCESS_SECRET,
    });
    const refresh = await jwt.verifyAsync<AuthTokenPayload>(
      tokens.refreshToken,
      { secret: REFRESH_SECRET },
    );
    const session = await sessions.findByJti(refresh.jti);

    expect(tokens).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
    expect(access).toMatchObject({
      sub: 'admin-id',
      role: 'ADMIN',
      type: 'access',
      jti: expect.any(String),
      iat: expect.any(Number),
      exp: expect.any(Number),
    });
    expect(refresh).toMatchObject({
      sub: 'admin-id',
      role: 'ADMIN',
      type: 'refresh',
      jti: expect.any(String),
      iat: expect.any(Number),
      exp: expect.any(Number),
    });
    await expect(
      passwordHash.compare(
        refreshTokenDigest(tokens.refreshToken),
        session!.getTokenHash(),
      ),
    ).resolves.toBe(true);
  });

  it('does not accept a separately issued refresh token for the stored session', async () => {
    const firstTokens = await service.login({
      email: 'admin@example.com',
      password: PASSWORD,
    });
    const secondTokens = await service.login({
      email: 'admin@example.com',
      password: PASSWORD,
    });
    const firstPayload = await jwt.verifyAsync<AuthTokenPayload>(
      firstTokens.refreshToken,
      { secret: REFRESH_SECRET },
    );
    const firstSession = await sessions.findByJti(firstPayload.jti);

    await expect(
      passwordHash.compare(
        secondTokens.refreshToken,
        firstSession!.getTokenHash(),
      ),
    ).resolves.toBe(false);
  });

  it('rejects an incorrect password instead of issuing tokens', async () => {
    await expect(
      service.login({ email: 'admin@example.com', password: 'wrong-password' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('revokes and replaces a consumed refresh session in one transaction', async () => {
    const initialTokens = await service.login({
      email: 'admin@example.com',
      password: PASSWORD,
    });
    const initialPayload = await jwt.verifyAsync<AuthTokenPayload>(
      initialTokens.refreshToken,
      { secret: REFRESH_SECRET },
    );

    const rotatedTokens = await service.refresh(initialTokens.refreshToken);
    const rotatedPayload = await jwt.verifyAsync<AuthTokenPayload>(
      rotatedTokens.refreshToken,
      { secret: REFRESH_SECRET },
    );
    const consumed = await sessions.findByJti(initialPayload.jti);
    const replacement = await sessions.findByJti(rotatedPayload.jti);

    expect(prisma.transactionCalls).toBe(1);
    expect(consumed?.isRevoked()).toBe(true);
    expect(replacement?.getUserId()).toBe('admin-id');
    await expect(
      passwordHash.compare(
        refreshTokenDigest(rotatedTokens.refreshToken),
        replacement!.getTokenHash(),
      ),
    ).resolves.toBe(true);
    await expect(service.refresh(initialTokens.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a revoked refresh session', async () => {
    const tokens = await service.login({
      email: 'admin@example.com',
      password: PASSWORD,
    });
    const payload = await jwt.verifyAsync<AuthTokenPayload>(
      tokens.refreshToken,
      {
        secret: REFRESH_SECRET,
      },
    );
    const session = await sessions.findByJti(payload.jti);
    session!.revoke(new Date());

    await expect(service.refresh(tokens.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('revokes a valid refresh token and accepts a repeated logout', async () => {
    const tokens = await service.login({
      email: 'admin@example.com',
      password: PASSWORD,
    });
    const payload = await jwt.verifyAsync<AuthTokenPayload>(
      tokens.refreshToken,
      {
        secret: REFRESH_SECRET,
      },
    );

    await service.logout(tokens.refreshToken);
    await expect(service.logout(tokens.refreshToken)).resolves.toBeUndefined();

    expect((await sessions.findByJti(payload.jti))?.isRevoked()).toBe(true);
  });

  it('rejects an access-typed token even when it has a refresh-token signature', async () => {
    const accessTypedToken = await jwt.signAsync(
      {
        sub: 'admin-id',
        role: 'ADMIN',
        type: 'access',
        jti: 'access-token-jti',
      },
      { secret: REFRESH_SECRET, expiresIn: '15m' },
    );

    await expect(service.refresh(accessTypedToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it.each([
    [
      'a missing access secret',
      {
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_SECRET: REFRESH_SECRET,
        JWT_REFRESH_TTL: '7d',
      },
    ],
    [
      'an invalid refresh TTL',
      {
        JWT_ACCESS_SECRET: ACCESS_SECRET,
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_SECRET: REFRESH_SECRET,
        JWT_REFRESH_TTL: 'never',
      },
    ],
  ])('rejects %s in JWT configuration', (_label, values) => {
    expect(() =>
      readJwtSettings({
        get: (key: keyof typeof values) => values[key],
      } as never),
    ).toThrow();
  });

  it.each([
    ['change-me-access-secret', `${'r'.repeat(32)}-refresh`],
    [`${'a'.repeat(32)}-access`, 'change-me-refresh-secret'],
  ])(
    'rejects legacy placeholder JWT secrets in production',
    (accessSecret, refreshSecret) => {
      expect(() =>
        readJwtSettings({
          get: (key: string) =>
            (
              ({
                NODE_ENV: 'production',
                JWT_ACCESS_SECRET: accessSecret,
                JWT_ACCESS_TTL: '15m',
                JWT_REFRESH_SECRET: refreshSecret,
                JWT_REFRESH_TTL: '7d',
              }) as Record<string, string>
            )[key],
        } as never),
      ).toThrow('must not use a known placeholder in production');
    },
  );

  it.each([
    ['access', 'a'.repeat(31), `${'r'.repeat(32)}-refresh`],
    ['refresh', `${'a'.repeat(32)}-access`, 'r'.repeat(31)],
  ])(
    'rejects a production %s secret below 32 UTF-8 bytes',
    (_case, accessSecret, refreshSecret) => {
      expect(() =>
        readJwtSettings({
          get: (key: string) =>
            (
              ({
                NODE_ENV: 'production',
                JWT_ACCESS_SECRET: accessSecret,
                JWT_ACCESS_TTL: '15m',
                JWT_REFRESH_SECRET: refreshSecret,
                JWT_REFRESH_TTL: '7d',
              }) as Record<string, string>
            )[key],
        } as never),
      ).toThrow('must be at least 32 UTF-8 bytes in production');
    },
  );

  it('accepts distinct 32-byte JWT secrets in production', () => {
    const accessSecret = 'aB3dE5fG7hJ9kL2mN4pQ6rS8tU0vW1xy';
    const refreshSecret = 'zY8xW6vU4tS2rQ0pN9mL7kJ5hG3fE1dC';

    expect(Buffer.byteLength(accessSecret, 'utf8')).toBe(32);
    expect(Buffer.byteLength(refreshSecret, 'utf8')).toBe(32);
    expect(
      readJwtSettings({
        get: (key: string) =>
          (
            ({
              NODE_ENV: 'production',
              JWT_ACCESS_SECRET: accessSecret,
              JWT_ACCESS_TTL: '15m',
              JWT_REFRESH_SECRET: refreshSecret,
              JWT_REFRESH_TTL: '7d',
            }) as Record<string, string>
          )[key],
      } as never),
    ).toMatchObject({
      accessSecret,
      refreshSecret,
    });
  });

  it.each([
    ['a sub-second access TTL', '999ms', '7d'],
    ['a non-whole-second refresh TTL', '15m', '1500ms'],
    ['an overflowing access TTL', '9007199254740992s', '7d'],
    ['a refresh TTL outside the Date TimeClip range', '15m', '280000y'],
  ])('rejects %s', (_label, accessTtl, refreshTtl) => {
    expect(() =>
      readJwtSettings({
        get: (key: string) =>
          (
            ({
              JWT_ACCESS_SECRET: ACCESS_SECRET,
              JWT_ACCESS_TTL: accessTtl,
              JWT_REFRESH_SECRET: REFRESH_SECRET,
              JWT_REFRESH_TTL: refreshTtl,
            }) as Record<string, string>
          )[key],
      } as never),
    ).toThrow();
  });
});

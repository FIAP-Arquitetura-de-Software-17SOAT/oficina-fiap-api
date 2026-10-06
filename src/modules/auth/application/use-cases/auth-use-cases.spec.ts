import { JwtService } from '@nestjs/jwt';
import { PasswordHasherPort } from '../../../../shared/identity/application/ports/password-hasher.port';
import { RefreshSessionRepositoryPort } from '../../../../shared/identity/application/ports/refresh-session-repository.port';
import { RefreshSession } from '../../../../shared/identity/domain/entities/refresh-session.entity';
import { User } from '../../../../shared/identity/domain/entities/user.entity';
import { JwtTokenIssuer } from '../../infrastructure/jwt/jwt-token-issuer';
import { AuthTokenPayload } from '../ports/token-issuer.port';
import { RefreshTokenSessions } from '../services/refresh-token-sessions';
import { LoginUseCase } from './login.use-case';
import { LogoutUseCase } from './logout.use-case';
import { RefreshTokensUseCase } from './refresh-tokens.use-case';

const ACCESS_SECRET = 'access-secret-for-tests';
const REFRESH_SECRET = 'refresh-secret-for-tests';
const PASSWORD = 'correct-horse-battery-staple';

/** Hash reversível e rápido: o que interessa aqui é o fluxo, não o bcrypt. */
class FakeHasher implements PasswordHasherPort {
  hash(value: string): Promise<string> {
    return Promise.resolve(`hashed:${value}`);
  }

  compare(value: string, valueHash: string): Promise<boolean> {
    return Promise.resolve(valueHash === `hashed:${value}`);
  }
}

class InMemorySessions implements RefreshSessionRepositoryPort {
  readonly sessions = new Map<string, RefreshSession>();
  rotations = 0;

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

  rotate(
    consumedJti: string,
    revokedAt: Date,
    replacement: RefreshSession,
  ): Promise<boolean> {
    this.rotations += 1;
    const consumed = this.sessions.get(consumedJti);
    if (!consumed || consumed.isRevoked() || consumed.isExpired(revokedAt)) {
      return Promise.resolve(false);
    }
    consumed.revoke(revokedAt);
    this.sessions.set(replacement.getJti(), replacement);
    return Promise.resolve(true);
  }
}

describe('auth use cases', () => {
  const jwt = new JwtService({ secret: ACCESS_SECRET });
  const hasher = new FakeHasher();
  const admin = User.restore('admin-id', {
    email: 'admin@example.com',
    passwordHash: `hashed:${PASSWORD}`,
    role: 'ADMIN',
    createdAt: new Date('2026-08-13T12:00:00.000Z'),
    updatedAt: new Date('2026-08-13T12:00:00.000Z'),
  });
  let sessions: InMemorySessions;
  let users: { findByEmail: jest.Mock; findById: jest.Mock };
  let login: LoginUseCase;
  let refresh: RefreshTokensUseCase;
  let logout: LogoutUseCase;

  const decode = (token: string, secret: string) =>
    jwt.verifyAsync<AuthTokenPayload>(token, { secret });
  const loginAs = (email = 'admin@example.com') =>
    login.execute({ email, password: PASSWORD });

  beforeEach(() => {
    sessions = new InMemorySessions();
    users = {
      findByEmail: jest.fn().mockResolvedValue(admin),
      findById: jest.fn().mockResolvedValue(admin),
    };
    const issuer = new JwtTokenIssuer(jwt, {
      get: (key: string) =>
        (
          ({
            JWT_ACCESS_SECRET: ACCESS_SECRET,
            JWT_ACCESS_TTL: '15m',
            JWT_REFRESH_SECRET: REFRESH_SECRET,
            JWT_REFRESH_TTL: '7d',
          }) as Record<string, string>
        )[key],
    } as never);
    const refreshTokens = new RefreshTokenSessions(issuer, hasher);
    login = new LoginUseCase(users as never, hasher, sessions, refreshTokens);
    refresh = new RefreshTokensUseCase(users as never, sessions, refreshTokens);
    logout = new LogoutUseCase(sessions, refreshTokens);
  });

  it('returns signed access and refresh tokens for valid credentials', async () => {
    const tokens = await loginAs();
    const access = await decode(tokens.accessToken, ACCESS_SECRET);
    const refreshPayload = await decode(tokens.refreshToken, REFRESH_SECRET);
    const session = await sessions.findByJti(refreshPayload.jti);

    expect(access).toMatchObject({
      sub: 'admin-id',
      role: 'ADMIN',
      type: 'access',
      jti: expect.any(String),
      iat: expect.any(Number),
      exp: expect.any(Number),
    });
    expect(refreshPayload).toMatchObject({ sub: 'admin-id', type: 'refresh' });
    expect(access.jti).not.toBe(refreshPayload.jti);
    expect(session?.getUserId()).toBe('admin-id');
    expect(session?.getExpiresAt()).toEqual(
      new Date(refreshPayload.exp * 1000),
    );
    expect(session?.getTokenHash()).not.toContain(tokens.refreshToken);
  });

  it('binds each stored session to the refresh token that opened it', async () => {
    const first = await loginAs();
    const second = await loginAs();
    const firstPayload = await decode(first.refreshToken, REFRESH_SECRET);
    const firstSession = (await sessions.findByJti(firstPayload.jti))!;
    const secondPayload = await decode(second.refreshToken, REFRESH_SECRET);

    expect(firstPayload.jti).not.toBe(secondPayload.jti);
    expect(firstSession.getTokenHash()).not.toBe(
      (await sessions.findByJti(secondPayload.jti))!.getTokenHash(),
    );
  });

  it('rejects an unknown e-mail or a wrong password with the same error', async () => {
    await expect(
      login.execute({ email: 'admin@example.com', password: 'wrong' }),
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      kind: 'UNAUTHORIZED',
      message: 'Invalid credentials',
    });

    users.findByEmail.mockResolvedValue(null);
    await expect(loginAs('nobody@example.com')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(sessions.sessions.size).toBe(0);
  });

  it('rotates: revokes the consumed session and stores the replacement atomically', async () => {
    const initial = await loginAs();
    const initialPayload = await decode(initial.refreshToken, REFRESH_SECRET);

    const rotated = await refresh.execute(initial.refreshToken);
    const rotatedPayload = await decode(rotated.refreshToken, REFRESH_SECRET);

    expect(sessions.rotations).toBe(1);
    expect((await sessions.findByJti(initialPayload.jti))?.isRevoked()).toBe(
      true,
    );
    expect((await sessions.findByJti(rotatedPayload.jti))?.getUserId()).toBe(
      'admin-id',
    );
    await expect(refresh.execute(initial.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Invalid refresh token',
    });
  });

  it('rejects a revoked, an expired and an unknown session', async () => {
    const tokens = await loginAs();
    const payload = await decode(tokens.refreshToken, REFRESH_SECRET);
    const session = (await sessions.findByJti(payload.jti))!;

    session.revoke(new Date());
    await expect(refresh.execute(tokens.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });

    sessions.sessions.set(
      payload.jti,
      RefreshSession.restore(session.getId(), {
        jti: payload.jti,
        tokenHash: session.getTokenHash(),
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
        userId: 'admin-id',
        createdAt: session.getCreatedAt(),
        updatedAt: session.getUpdatedAt(),
      }),
    );
    await expect(refresh.execute(tokens.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });

    sessions.sessions.delete(payload.jti);
    await expect(refresh.execute(tokens.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('rejects a refresh when the user disappeared or the rotation lost the race', async () => {
    const tokens = await loginAs();

    users.findById.mockResolvedValueOnce(null);
    await expect(refresh.execute(tokens.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });

    jest.spyOn(sessions, 'rotate').mockResolvedValueOnce(false);
    await expect(refresh.execute(tokens.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('rejects a token whose session belongs to another user or another token', async () => {
    const tokens = await loginAs();
    const payload = await decode(tokens.refreshToken, REFRESH_SECRET);
    const session = (await sessions.findByJti(payload.jti))!;
    sessions.sessions.set(
      payload.jti,
      RefreshSession.restore(session.getId(), {
        jti: payload.jti,
        tokenHash: 'hashed:other-token-digest',
        expiresAt: session.getExpiresAt(),
        revokedAt: null,
        userId: 'admin-id',
        createdAt: session.getCreatedAt(),
        updatedAt: session.getUpdatedAt(),
      }),
    );

    await expect(refresh.execute(tokens.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
    await expect(logout.execute(tokens.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('revokes a valid refresh token and accepts a repeated logout', async () => {
    const tokens = await loginAs();
    const payload = await decode(tokens.refreshToken, REFRESH_SECRET);
    const revoke = jest.spyOn(sessions, 'revoke');

    await logout.execute(tokens.refreshToken);
    await expect(logout.execute(tokens.refreshToken)).resolves.toBeUndefined();

    expect((await sessions.findByJti(payload.jti))?.isRevoked()).toBe(true);
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it('puts the client id in the tokens of a CUSTOMER and lets it refresh', async () => {
    const customer = User.createCustomer({
      email: 'maria@example.com',
      passwordHash: `hashed:${PASSWORD}`,
      clientId: 'client-id',
    });
    users.findByEmail.mockResolvedValue(customer);
    users.findById.mockResolvedValue(customer);

    const tokens = await loginAs('maria@example.com');
    const renewed = await refresh.execute(tokens.refreshToken);

    expect(await decode(tokens.accessToken, ACCESS_SECRET)).toMatchObject({
      role: 'CUSTOMER',
      clientId: 'client-id',
    });
    expect(await decode(renewed.accessToken, ACCESS_SECRET)).toMatchObject({
      role: 'CUSTOMER',
      clientId: 'client-id',
    });
  });

  it('lets an EMPLOYEE refresh too and keeps the client id out of staff tokens', async () => {
    const employee = User.create({
      email: 'employee@example.com',
      passwordHash: `hashed:${PASSWORD}`,
      role: 'EMPLOYEE',
    });
    users.findByEmail.mockResolvedValue(employee);
    users.findById.mockResolvedValue(employee);

    const tokens = await loginAs('employee@example.com');

    await expect(refresh.execute(tokens.refreshToken)).resolves.toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
    expect(await decode(tokens.accessToken, ACCESS_SECRET)).not.toHaveProperty(
      'clientId',
    );
  });

  it.each([
    [
      'an access-typed token signed with the refresh secret',
      { sub: 'admin-id', role: 'ADMIN', type: 'access', jti: 'j' },
    ],
    [
      'a refresh token with an unknown role',
      { sub: 'admin-id', role: 'ROOT', type: 'refresh', jti: 'j' },
    ],
    [
      'a refresh token without jti',
      { sub: 'admin-id', role: 'ADMIN', type: 'refresh' },
    ],
  ])('rejects %s', async (_label, claims) => {
    const token = await jwt.signAsync(claims, {
      secret: REFRESH_SECRET,
      expiresIn: '15m',
    });

    await expect(refresh.execute(token)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
    await expect(refresh.execute('garbage')).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });
});

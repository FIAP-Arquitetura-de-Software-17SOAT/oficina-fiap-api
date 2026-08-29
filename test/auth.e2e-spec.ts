import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { ClientRepository } from '../src/modules/client/repositories/client.repository';
import { PrismaService } from '../src/shared/database/prisma.service';
import { RefreshSessionRepository } from '../src/shared/identity/repositories/refresh-session.repository';
import { UserRepository } from '../src/shared/identity/repositories/user.repository';
import { PasswordHashService } from '../src/shared/identity/services/password-hash.service';
import { User } from '../src/shared/identity/entities/user.entity';
import { configureApp } from '../src/setup-app';
import { AuthTestModule } from './auth-test.controller';
import { InMemoryClientRepository } from './in-memory-client.repository';
import {
  InMemoryIdentityPrisma,
  InMemoryRefreshSessionRepository,
  InMemoryUserRepository,
} from './in-memory-identity.repository';

const ACCESS_SECRET = 'e2e-access-secret';
const REFRESH_SECRET = 'e2e-refresh-secret';
const ADMIN_ID = 'admin-id';
const ADMIN_EMAIL = 'admin@example.com';
const PASSWORD = 'correct-horse-battery-staple';

interface E2eTokenPair {
  accessToken: string;
  refreshToken: string;
}

describe('Authentication and authorization (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;
  let users: InMemoryUserRepository;
  let sessions: InMemoryRefreshSessionRepository;
  let admin: User;
  const jwt = new JwtService();

  beforeAll(async () => {
    const passwordHash = new PasswordHashService();
    admin = User.restore(ADMIN_ID, {
      email: ADMIN_EMAIL,
      passwordHash: await passwordHash.hash(PASSWORD),
      role: 'ADMIN',
      createdAt: new Date('2026-08-13T12:00:00.000Z'),
      updatedAt: new Date('2026-08-13T12:00:00.000Z'),
    });
    users = new InMemoryUserRepository();
    sessions = new InMemoryRefreshSessionRepository();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, AuthTestModule],
    })
      .overrideProvider(PrismaService)
      .useValue(new InMemoryIdentityPrisma(sessions.sessions))
      .overrideProvider(UserRepository)
      .useValue(users)
      .overrideProvider(RefreshSessionRepository)
      .useValue(sessions)
      .overrideProvider(ClientRepository)
      .useValue(new InMemoryClientRepository())
      .compile();

    app = configureApp(
      moduleFixture.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
    http = app.getHttpServer();
  });

  beforeEach(() => {
    users.reset([admin]);
    sessions.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  const login = () =>
    request(http).post('/api/v1/auth/login').send({
      email: ADMIN_EMAIL,
      password: PASSWORD,
    });

  const accessToken = (
    overrides: Record<string, unknown> = {},
    expiresIn: '15m' | number = '15m',
  ) =>
    jwt.signAsync(
      {
        sub: ADMIN_ID,
        role: 'ADMIN',
        type: 'access',
        jti: 'access-jti',
        ...overrides,
      },
      { secret: ACCESS_SECRET, expiresIn },
    );

  it('returns an access and refresh token for valid credentials', async () => {
    const response = await login().expect(200);
    const tokens = response.body as E2eTokenPair;

    expect(tokens).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
    expect(jwt.decode(tokens.accessToken)).toMatchObject({
      sub: ADMIN_ID,
      role: 'ADMIN',
      type: 'access',
    });
    const refreshPayload = jwt.decode<{ jti: string }>(tokens.refreshToken);
    expect(refreshPayload).toMatchObject({
      sub: ADMIN_ID,
      role: 'ADMIN',
      type: 'refresh',
    });
    expect(admin.getPasswordHash()).toMatch(/^\$2[aby]\$12\$/);
    expect(sessions.sessions.get(refreshPayload.jti)?.getTokenHash()).toMatch(
      /^\$2[aby]\$12\$/,
    );
    expect(sessions.sessions.get(refreshPayload.jti)?.getTokenHash()).not.toBe(
      tokens.refreshToken,
    );
  });

  it.each([
    ['an incorrect password', ADMIN_EMAIL, 'incorrect-password'],
    ['an unknown account', 'unknown@example.com', PASSWORD],
  ])('rejects login with %s', async (_case, email, password) => {
    await request(http)
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(401);
  });

  it('rotates a refresh token once and rejects replay of the consumed token', async () => {
    const initial = (await login().expect(200)).body as E2eTokenPair;
    const rotated = (
      await request(http)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: initial.refreshToken })
        .expect(201)
    ).body as E2eTokenPair;

    expect(rotated.refreshToken).not.toBe(initial.refreshToken);
    await request(http)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: initial.refreshToken })
      .expect(401);
    await request(http)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated.refreshToken })
      .expect(201);
  });

  it('revokes the refresh session on logout', async () => {
    const tokens = (await login().expect(200)).body as E2eTokenPair;

    await request(http)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: tokens.refreshToken })
      .expect(204);
    await request(http)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(401);
  });

  it('rejects malformed refresh tokens', async () => {
    await request(http)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'not-a-jwt' })
      .expect(401);
  });

  it('rejects expired refresh tokens', async () => {
    const expiredRefresh = await jwt.signAsync(
      {
        sub: ADMIN_ID,
        role: 'ADMIN',
        type: 'refresh',
        jti: 'expired-refresh-jti',
      },
      { secret: REFRESH_SECRET, expiresIn: -1 },
    );

    await request(http)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: expiredRefresh })
      .expect(401);
  });

  it('denies a protected route when the access token is missing', async () => {
    await request(http).get('/api/v1/test-auth/authenticated').expect(401);
  });

  it('exposes only the authenticated id and role to the handler', async () => {
    const token = await accessToken();

    const response = await request(http)
      .get('/api/v1/test-auth/authenticated')
      .auth(token, { type: 'bearer' })
      .expect(200);

    expect(response.body).toEqual({ id: ADMIN_ID, role: 'ADMIN' });
  });

  it.each([
    ['a malformed token', 'not-a-jwt'],
    ['an expired token', () => accessToken({}, -1)],
    [
      'a refresh-typed token signed with the access secret',
      () => accessToken({ type: 'refresh' }),
    ],
  ])('rejects %s on a protected route', async (_case, tokenValue) => {
    const token =
      typeof tokenValue === 'string' ? tokenValue : await tokenValue();

    await request(http)
      .get('/api/v1/test-auth/authenticated')
      .auth(token, { type: 'bearer' })
      .expect(401);
  });

  it('rejects a real refresh token on a protected route', async () => {
    const tokens = (await login().expect(200)).body as E2eTokenPair;

    await request(http)
      .get('/api/v1/test-auth/authenticated')
      .auth(tokens.refreshToken, { type: 'bearer' })
      .expect(401);
  });

  it('allows ADMIN access when the route requires ADMIN', async () => {
    const token = await accessToken();

    await request(http)
      .get('/api/v1/test-auth/admin')
      .auth(token, { type: 'bearer' })
      .expect(200, { authorized: true });
  });

  it('denies CUSTOMER access when the route requires ADMIN', async () => {
    const token = await accessToken({ role: 'CUSTOMER' });

    await request(http)
      .get('/api/v1/test-auth/admin')
      .auth(token, { type: 'bearer' })
      .expect(403);
  });

  it('protege as rotas administrativas: sem token não passa', async () => {
    await request(http).get('/api/v1/clients').expect(401);
    await request(http).get('/api/v1/service-orders').expect(401);
    await request(http).get('/api/v1/budgets?serviceOrderId=x').expect(401);
    await request(http).get('/api/v1/purchase-orders').expect(401);
    await request(http).get('/api/v1/vehicles').expect(401);
    await request(http).get('/api/v1/parts').expect(401);
  });

  it('deixa públicos apenas o health e a autenticação', async () => {
    await request(http).get('/api/v1/health').expect(200);
    // login com credencial inválida responde 401 do próprio fluxo, não do guard
    await request(http)
      .post('/api/v1/auth/login')
      .send({ email: 'nao@existe.com', password: 'Senha!12345' })
      .expect(401);
  });

  it('does not accept a token signed with the refresh secret as access', async () => {
    const token = await jwt.signAsync(
      {
        sub: ADMIN_ID,
        role: 'ADMIN',
        type: 'access',
        jti: 'wrong-secret-jti',
      },
      { secret: REFRESH_SECRET, expiresIn: '15m' },
    );

    await request(http)
      .get('/api/v1/test-auth/authenticated')
      .auth(token, { type: 'bearer' })
      .expect(401);
  });
});

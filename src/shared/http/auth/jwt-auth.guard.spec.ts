import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AccessTokenStrategy } from './access-token.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('guard-test')
class GuardTestController {
  @Get()
  @UseGuards(JwtAuthGuard)
  protectedRoute(): { ok: true } {
    return { ok: true };
  }
}

describe('JwtAuthGuard', () => {
  let app: INestApplication<App>;
  let http: App;
  const jwt = new JwtService();
  const secret = 'guard-unit-access-secret';

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [() => ({ JWT_ACCESS_SECRET: secret })],
        }),
      ],
      controllers: [GuardTestController],
      providers: [AccessTokenStrategy, JwtAuthGuard],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('denies a request without a bearer token', async () => {
    await request(http).get('/guard-test').expect(401);
  });

  it('allows a valid access bearer token', async () => {
    const token = await jwt.signAsync(
      {
        sub: 'admin-id',
        role: 'ADMIN',
        type: 'access',
        jti: 'guard-access-jti',
      },
      { secret, expiresIn: '15m' },
    );

    await request(http)
      .get('/guard-test')
      .auth(token, { type: 'bearer' })
      .expect(200, { ok: true });
  });
});

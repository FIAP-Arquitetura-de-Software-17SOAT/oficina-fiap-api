import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PartRepository } from '../src/modules/stock/repositories/part.repository';
import { PrismaService } from '../src/shared/database/prisma.service';
import { configureApp } from '../src/setup-app';
import { InMemoryPartRepository } from './in-memory-part.repository';

const payload = {
  code: 'OIL-FILTER-123',
  name: 'Oil filter',
  description: 'Filter for engine oil',
  type: 'PART',
  unit: 'UNIT',
  unitPrice: '149.90',
  quantity: 10,
  minimumQuantity: 3,
};

describe('Stock (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;
  const jwt = new JwtService();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(PartRepository)
      .useValue(new InMemoryPartRepository())
      .compile();

    app = configureApp(
      moduleFixture.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  const accessToken = (role: string) =>
    jwt.signAsync(
      {
        sub: 'stock-user-id',
        role,
        type: 'access',
        jti: 'stock-access-jti',
      },
      { secret: 'e2e-access-secret', expiresIn: '15m' },
    );

  it('rejects an unauthenticated stock request', async () => {
    await request(http).get('/api/v1/stock').expect(401);
  });

  it.each(['ADMIN', 'EMPLOYEE'])(
    'allows %s to list stock parts',
    async (role) => {
      const token = await accessToken(role);

      await request(http)
        .get('/api/v1/stock')
        .auth(token, { type: 'bearer' })
        .expect(200);
    },
  );

  it('forbids authenticated roles outside stock access', async () => {
    const token = await accessToken('CUSTOMER');

    await request(http)
      .get('/api/v1/stock')
      .auth(token, { type: 'bearer' })
      .expect(403);
  });

  it('performs the protected part CRUD', async () => {
    const token = await accessToken('ADMIN');
    const created = await request(http)
      .post('/api/v1/stock')
      .auth(token, { type: 'bearer' })
      .send(payload)
      .expect(201);

    expect(created.body).toMatchObject({
      code: 'OIL-FILTER-123',
      unitPrice: '149.90',
      quantity: 10,
    });

    const updated = await request(http)
      .patch(`/api/v1/stock/${created.body.id}`)
      .auth(token, { type: 'bearer' })
      .send({ quantity: 12 })
      .expect(200);

    expect(updated.body.quantity).toBe(12);

    await request(http)
      .delete(`/api/v1/stock/${created.body.id}`)
      .auth(token, { type: 'bearer' })
      .expect(204);

    await request(http)
      .get(`/api/v1/stock/${created.body.id}`)
      .auth(token, { type: 'bearer' })
      .expect(404);
  });

  it('rejects invalid payloads before reaching the stock service', async () => {
    const token = await accessToken('ADMIN');

    await request(http)
      .post('/api/v1/stock')
      .auth(token, { type: 'bearer' })
      .send({ ...payload, quantity: -1, unexpected: true })
      .expect(400);
  });
});

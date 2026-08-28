import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { configureApp } from '../src/setup-app';
import { allowAuthenticated } from './allow-authenticated';

describe('Purchase order security hardening (e2e)', () => {
  let app: INestApplication<App>;
  const validUuid = '550e8400-e29b-41d4-a716-446655440000';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await allowAuthenticated(
      Test.createTestingModule({
        imports: [AppModule],
      }).overrideProvider(PrismaService).useValue({}),
    ).compile();

    app = configureApp(
      moduleFixture.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['GET', '/api/v1/purchase-orders/id'],
    ['POST', '/api/v1/purchase-orders/id/items'],
    ['DELETE', '/api/v1/purchase-orders/id/items/itemId'],
    ['PATCH', '/api/v1/purchase-orders/id/register-purchase'],
    ['PATCH', '/api/v1/purchase-orders/id/deliver'],
  ])('rejects non-UUID route params before persistence: %s %s', async (method, path) => {
    const response = request(app.getHttpServer())[method.toLowerCase() as 'get'](
      path,
    );

    if (method === 'POST') {
      response.send({
        partId: '550e8400-e29b-41d4-a716-446655440000',
        quantity: 1,
        unitPrice: 10,
      });
    }

    await response.expect(400);
  });

  it('rejects a non-UUID purchase-order item id independently', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/purchase-orders/${validUuid}/items/itemId`)
      .expect(400);
  });
});

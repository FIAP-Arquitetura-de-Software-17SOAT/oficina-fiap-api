import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { configureApp } from '../src/setup-app';

const describeDatabase =
  process.env.RUN_DATABASE_TESTS === 'true' && process.env.DATABASE_URL
    ? describe
    : describe.skip;

describeDatabase('Budget persistence (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;
  let prisma: PrismaService;
  const serviceOrderId = `service-persistence-${Date.now()}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = configureApp(
      moduleFixture.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
    http = app.getHttpServer();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (prisma) {
      try {
        await prisma.budget.deleteMany({ where: { serviceOrderId } });
      } catch {
        // The test should report the original database connection/setup failure.
      }
    }

    if (app) {
      await app.close();
    }
  });

  it('persists the budget HTTP flow through the real Prisma repository', async () => {
    const create = await request(http)
      .post('/api/v1/budgets')
      .send({
        serviceOrderId,
        items: [
          {
            description: 'Oil change',
            type: 'SERVICE',
            quantity: 1,
            unitPriceCents: 120,
          },
        ],
      })
      .expect(201);

    const budgetId = create.body.id as string;

    const persistedAfterCreate = await prisma.budget.findUnique({
      where: { id: budgetId },
      include: { items: true },
    });
    expect(persistedAfterCreate?.totalCents.toString()).toBe('120');
    expect(persistedAfterCreate?.items).toHaveLength(1);

    let addedItemId = '';

    await request(http)
      .post(`/api/v1/budgets/${budgetId}/items`)
      .send({
        description: 'Oil filter',
        type: 'PART',
        quantity: 1,
        unitPriceCents: 40,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.items).toHaveLength(2);
        expect(body.totalCents).toBe(160);
        addedItemId = body.items.find(
          (item: { description: string }) => item.description === 'Oil filter',
        ).id;
      });

    const persistedAfterAdd = await prisma.budget.findUnique({
      where: { id: budgetId },
      include: { items: true },
    });
    expect(persistedAfterAdd?.totalCents.toString()).toBe('160');
    expect(persistedAfterAdd?.items).toHaveLength(2);

    await request(http)
      .delete(`/api/v1/budgets/${budgetId}/items/${addedItemId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.items).toHaveLength(1);
        expect(body.totalCents).toBe(120);
      });

    const persistedAfterRemove = await prisma.budget.findUnique({
      where: { id: budgetId },
      include: { items: true },
    });
    expect(persistedAfterRemove?.totalCents.toString()).toBe('120');
    expect(persistedAfterRemove?.items).toHaveLength(1);

    await request(http).post(`/api/v1/budgets/${budgetId}/send`).expect(200);

    await request(http)
      .post(`/api/v1/budgets/${budgetId}/accept`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('ACCEPTED');
        expect(body.totalCents).toBe(120);
      });

    const accepted = await prisma.budget.findUnique({
      where: { id: budgetId },
      include: { items: true },
    });
    expect(accepted?.status).toBe('ACCEPTED');
    expect(accepted?.items).toHaveLength(1);

    await request(http)
      .get(`/api/v1/budgets?serviceOrderId=${serviceOrderId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0].id).toBe(budgetId);
        expect(body[0].status).toBe('ACCEPTED');
      });
  });
});

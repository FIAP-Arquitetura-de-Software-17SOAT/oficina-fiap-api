import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { configureApp } from '../src/setup-app';
import { allowAuthenticated } from './allow-authenticated';

const describeDatabase =
  process.env.RUN_DATABASE_TESTS === 'true' && process.env.DATABASE_URL
    ? describe
    : describe.skip;

describeDatabase('Budget persistence (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;
  let prisma: PrismaService;

  let clientId = '';
  let vehicleId = '';
  let serviceOrderId = '';

  // Documento é validado por dígito verificador, então não dá para gerar ao
  // acaso; e-mail e placa variam para não colidir entre execuções.
  const unique = Date.now().toString().slice(-6);
  const clientPayload = {
    name: 'Maria Silva',
    document: '529.982.247-25',
    email: `budget-persistence-${unique}@example.com`,
    phone: '(11) 99999-8888',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await allowAuthenticated(
      Test.createTestingModule({
        imports: [AppModule],
      }),
    ).compile();

    app = configureApp(
      moduleFixture.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
    http = app.getHttpServer();
    prisma = app.get(PrismaService);

    // Resíduo de execução anterior travaria o documento único. A remoção segue
    // a ordem que as FKs RESTRICT impõem: orçamento, OS, veículo, cliente.
    const leftovers = await prisma.client.findMany({
      where: { document: '52998224725' },
      select: { id: true },
    });

    for (const { id } of leftovers) {
      const orders = await prisma.serviceOrder.findMany({
        where: { clientId: id },
        select: { id: true },
      });

      await prisma.budget.deleteMany({
        where: { serviceOrderId: { in: orders.map((o) => o.id) } },
      });
      await prisma.serviceOrder.deleteMany({ where: { clientId: id } });
      await prisma.vehicle.deleteMany({ where: { clientId: id } });
      await prisma.client.delete({ where: { id } });
    }

    const client = await request(http)
      .post('/api/v1/client')
      .send(clientPayload)
      .expect(201);
    clientId = client.body.id as string;

    const vehicle = await request(http)
      .post('/api/v1/vehicle')
      .send({
        clientId,
        plate: 'ABC1D23',
        brand: 'Fiat',
        model: 'Argo',
        year: 2022,
      })
      .expect(201);
    vehicleId = vehicle.body.id as string;

    const serviceOrder = await request(http)
      .post('/api/v1/service-order')
      .send({ clientId, vehicleId, description: 'Barulho no motor' })
      .expect(201);
    serviceOrderId = serviceOrder.body.id as string;

    // Basta atribuir: gerar o orçamento é o que move a OS para
    // AWAITING_APPROVAL, e é dali que aceite e recusa partem.
    await request(http)
      .patch(`/api/v1/service-order/${serviceOrderId}/assign`)
      .send({ mechanicId: 'cccccccc-1c2e-4f5a-8b9c-0d1e2f3a4b5c' })
      .expect(200);
  });

  afterAll(async () => {
    if (prisma) {
      try {
        await prisma.budget.deleteMany({ where: { serviceOrderId } });
        await prisma.serviceOrder.deleteMany({ where: { id: serviceOrderId } });
        await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
        await prisma.client.deleteMany({ where: { id: clientId } });
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
            unitPrice: 120,
          },
        ],
      })
      .expect(201);

    const budgetId = create.body.id as string;

    const persistedAfterCreate = await prisma.budget.findUnique({
      where: { id: budgetId },
      include: { items: true },
    });
    expect(persistedAfterCreate?.totalCents).toBe(12_000);
    expect(persistedAfterCreate?.items).toHaveLength(1);

    let addedItemId = '';

    await request(http)
      .post(`/api/v1/budgets/${budgetId}/items`)
      .send({
        description: 'Oil filter',
        type: 'PART',
        quantity: 1,
        unitPrice: 40,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.items).toHaveLength(2);
        expect(body.totalAmount).toBe(160);
        addedItemId = body.items.find(
          (item: { description: string }) => item.description === 'Oil filter',
        ).id;
      });

    const persistedAfterAdd = await prisma.budget.findUnique({
      where: { id: budgetId },
      include: { items: true },
    });
    expect(persistedAfterAdd?.totalCents).toBe(16_000);
    expect(persistedAfterAdd?.items).toHaveLength(2);

    await request(http)
      .delete(`/api/v1/budgets/${budgetId}/items/${addedItemId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.items).toHaveLength(1);
        expect(body.totalAmount).toBe(120);
      });

    const persistedAfterRemove = await prisma.budget.findUnique({
      where: { id: budgetId },
      include: { items: true },
    });
    expect(persistedAfterRemove?.totalCents).toBe(12_000);
    expect(persistedAfterRemove?.items).toHaveLength(1);

    await request(http).post(`/api/v1/budgets/${budgetId}/send`).expect(200);

    await request(http)
      .post(`/api/v1/budgets/${budgetId}/accept`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('ACCEPTED');
        expect(body.totalAmount).toBe(120);
      });

    const accepted = await prisma.budget.findUnique({
      where: { id: budgetId },
      include: { items: true },
    });
    expect(accepted?.status).toBe('ACCEPTED');
    expect(accepted?.items).toHaveLength(1);

    // Política: todo orçamento aceito passa pela solicitação de peças.
    await request(http)
      .get(`/api/v1/service-order/${serviceOrderId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('AWAITING_PARTS');
      });

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

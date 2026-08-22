import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  Budget,
  BudgetItemType,
} from '../src/modules/budget/entities/budget.entity';
import { BudgetRepository } from '../src/modules/budget/repositories/budget.repository';
import { PrismaService } from '../src/shared/database/prisma.service';
import { configureApp } from '../src/setup-app';
import { InMemoryBudgetRepository } from './in-memory-budget.repository';

describe('InMemoryBudgetRepository', () => {
  it('does not share mutable budget instances with persisted state', async () => {
    const repository = new InMemoryBudgetRepository();
    const budget = Budget.create({
      serviceOrderId: 'service-123',
      version: 1,
      items: [
        {
          description: 'Oil change',
          type: BudgetItemType.SERVICE,
          quantity: 1,
          unitPrice: 120,
        },
      ],
    });

    await repository.create(budget);
    budget.sendToCustomer();

    const persisted = await repository.findById(budget.getId());

    expect(persisted).not.toBe(budget);
    expect(persisted?.getStatus()).toBe('GENERATED');
  });

  it('lists budgets in ascending version order regardless of insertion order', async () => {
    const repository = new InMemoryBudgetRepository();
    const versionThree = Budget.create({
      serviceOrderId: 'service-123',
      version: 3,
      items: [
        {
          description: 'Oil change',
          type: BudgetItemType.SERVICE,
          quantity: 1,
          unitPrice: 120,
        },
      ],
    });
    const versionOne = Budget.create({
      serviceOrderId: 'service-123',
      version: 1,
      items: [
        {
          description: 'Brake pad',
          type: BudgetItemType.PART,
          quantity: 1,
          unitPrice: 80,
        },
      ],
    });

    await repository.create(versionThree);
    await repository.create(versionOne);

    const budgets = await repository.findByServiceOrderId('service-123');

    expect(budgets.map((budget) => budget.getVersion())).toEqual([1, 3]);
  });
});

describe('Budget (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(BudgetRepository)
      .useValue(new InMemoryBudgetRepository())
      .compile();

    app = configureApp(
      moduleFixture.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
    http = app.getHttpServer();
  });

  afterEach(async () => {
    await app.close();
  });

  const createBudget = async () => {
    const response = await request(http)
      .post('/api/v1/budgets')
      .send({
        serviceOrderId: 'service-123',
        items: [
          {
            description: 'Oil change',
            type: 'SERVICE',
            quantity: 1,
            unitPrice: 120,
          },
          {
            description: 'Oil filter',
            type: 'PART',
            quantity: 1,
            unitPrice: 40,
          },
        ],
      })
      .expect(201);

    return {
      id: response.body.id as string,
      itemId: response.body.items[0].id as string,
    };
  };

  it('creates, sends, accepts, and fetches a budget', async () => {
    const create = await request(http)
      .post('/api/v1/budgets')
      .send({
        serviceOrderId: 'service-123',
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

    let addedItemId: string;

    await request(http)
      .post(`/api/v1/budgets/${create.body.id}/items`)
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

    await request(http)
      .get(`/api/v1/budgets/${create.body.id}/total`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.budgetId).toBe(create.body.id);
        expect(body.totalAmount).toBe(160);
      });

    await request(http)
      .delete(`/api/v1/budgets/${create.body.id}/items/${addedItemId!}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.items).toHaveLength(1);
        expect(body.totalAmount).toBe(120);
      });

    await request(http)
      .post(`/api/v1/budgets/${create.body.id}/send`)
      .expect(200);

    await request(http)
      .post(`/api/v1/budgets/${create.body.id}/accept`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('ACCEPTED');
        expect(body.totalAmount).toBe(120);
      });

    await request(http)
      .get(`/api/v1/budgets/${create.body.id}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('ACCEPTED');
        expect(body.totalAmount).toBe(120);
      });

    await request(http)
      .get('/api/v1/budgets?serviceOrderId=service-123')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0].id).toBe(create.body.id);
      });
  });

  it('rejects decisions before send and blank refusal reasons', async () => {
    const { id } = await createBudget();

    await request(http).post(`/api/v1/budgets/${id}/accept`).expect(400);

    await request(http)
      .post(`/api/v1/budgets/${id}/refuse`)
      .send({ reason: 'Customer found it expensive' })
      .expect(400);

    await request(http).post(`/api/v1/budgets/${id}/send`).expect(200);

    await request(http)
      .post(`/api/v1/budgets/${id}/refuse`)
      .send({ reason: '   ' })
      .expect(400);
  });

  it('rejects item monetary values beyond supported precision and range', async () => {
    await request(http)
      .post('/api/v1/budgets')
      .send({
        serviceOrderId: 'service-123',
        items: [
          {
            description: 'Precision overflow',
            type: 'PART',
            quantity: 1.001,
            unitPrice: 1,
          },
        ],
      })
      .expect(400);

    await request(http)
      .post('/api/v1/budgets')
      .send({
        serviceOrderId: 'service-123',
        items: [
          {
            description: 'Range overflow',
            type: 'PART',
            quantity: 1,
            unitPrice: 100_000_000,
          },
        ],
      })
      .expect(400);
  });

  it('rejects budget list requests without a valid service order id', async () => {
    await request(http).get('/api/v1/budgets').expect(400);
    await request(http).get('/api/v1/budgets?serviceOrderId=').expect(400);
    await request(http)
      .get('/api/v1/budgets?serviceOrderId=%20%20%20')
      .expect(400);
  });

  it('rejects item changes after send and all changes after acceptance', async () => {
    const { id, itemId } = await createBudget();

    await request(http).post(`/api/v1/budgets/${id}/send`).expect(200);

    await request(http)
      .post(`/api/v1/budgets/${id}/items`)
      .send({
        description: 'Brake fluid',
        type: 'PART',
        quantity: 1,
        unitPrice: 30,
      })
      .expect(400);

    await request(http)
      .delete(`/api/v1/budgets/${id}/items/${itemId}`)
      .expect(400);

    await request(http).post(`/api/v1/budgets/${id}/accept`).expect(200);

    await request(http).post(`/api/v1/budgets/${id}/send`).expect(400);
    await request(http).post(`/api/v1/budgets/${id}/accept`).expect(400);
    await request(http)
      .post(`/api/v1/budgets/${id}/refuse`)
      .send({ reason: 'Customer changed their mind' })
      .expect(400);
    await request(http)
      .post(`/api/v1/budgets/${id}/items`)
      .send({
        description: 'Brake fluid',
        type: 'PART',
        quantity: 1,
        unitPrice: 30,
      })
      .expect(400);
    await request(http)
      .delete(`/api/v1/budgets/${id}/items/${itemId}`)
      .expect(400);
  });

  it('rejects all decisions after refusal', async () => {
    const { id, itemId } = await createBudget();

    await request(http).post(`/api/v1/budgets/${id}/send`).expect(200);

    await request(http)
      .post(`/api/v1/budgets/${id}/refuse`)
      .send({ reason: 'Customer found it expensive' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('REFUSED');
        expect(body.refusalReason).toBe('Customer found it expensive');
      });

    await request(http)
      .get(`/api/v1/budgets/${id}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('REFUSED');
        expect(body.refusalReason).toBe('Customer found it expensive');
      });

    await request(http).post(`/api/v1/budgets/${id}/send`).expect(400);
    await request(http).post(`/api/v1/budgets/${id}/accept`).expect(400);
    await request(http)
      .post(`/api/v1/budgets/${id}/refuse`)
      .send({ reason: 'Customer changed their mind' })
      .expect(400);
    await request(http)
      .post(`/api/v1/budgets/${id}/items`)
      .send({
        description: 'Brake fluid',
        type: 'PART',
        quantity: 1,
        unitPrice: 30,
      })
      .expect(400);
    await request(http)
      .delete(`/api/v1/budgets/${id}/items/${itemId}`)
      .expect(400);
  });
});

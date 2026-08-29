import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  Budget,
  BudgetItemType,
} from '../src/modules/budget/entities/budget.entity';
import { Money } from '../src/shared/domain/value-objects/money.vo';
import { BudgetRepository } from '../src/modules/budget/repositories/budget.repository';
import { ClientRepository } from '../src/modules/client/repositories/client.repository';
import { NotificationType } from '../src/modules/notification/enums/notification-type.enum';
import { NotificationRepository } from '../src/modules/notification/repositories/notification.repository';
import { NotificationService } from '../src/modules/notification/services/notification.service';
import { ServiceOrderRepository } from '../src/modules/service-order/repositories/service-order.repository';
import { VehicleRepository } from '../src/modules/vehicle/repositories/vehicle.repository';
import { PrismaService } from '../src/shared/database/prisma.service';
import { configureApp } from '../src/setup-app';
import { InMemoryBudgetRepository } from './in-memory-budget.repository';
import { InMemoryClientRepository } from './in-memory-client.repository';
import { InMemoryServiceOrderRepository } from './in-memory-service-order.repository';
import { InMemoryVehicleRepository } from './in-memory-vehicle.repository';
import { InMemoryNotificationRepository } from './in-memory-notification.repository';
import { allowAuthenticated } from './allow-authenticated';
import { EmailSender } from '../src/shared/notifications/email/email-sender';

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
          unitPrice: Money.fromDecimal(120),
        },
      ],
    });

    await repository.create(budget);
    budget.sendToClient();

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
          unitPrice: Money.fromDecimal(120),
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
          unitPrice: Money.fromDecimal(80),
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
  let notifications: { enqueue: jest.Mock };
  // Aceitar ou recusar um orcamento mexe na ordem de servico, entao o cenario
  // minimo agora inclui cliente, veiculo e uma OS aguardando aprovacao.
  let serviceOrderId: string;

  beforeEach(async () => {
    notifications = {
      // A rejeição simula a falha de entrega/filas sem permitir que ela altere
      // a resposta HTTP da criação do orçamento.
      enqueue: jest
        .fn()
        .mockRejectedValue(new Error('notification unavailable')),
    };
    const moduleFixture: TestingModule = await allowAuthenticated(
      Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(PrismaService)
        .useValue({})
        .overrideProvider(BudgetRepository)
        .useValue(new InMemoryBudgetRepository())
        .overrideProvider(ClientRepository)
        .useValue(new InMemoryClientRepository())
        .overrideProvider(VehicleRepository)
        .useValue(new InMemoryVehicleRepository())
        .overrideProvider(ServiceOrderRepository)
        .useValue(new InMemoryServiceOrderRepository())
        .overrideProvider(NotificationService)
        .useValue(notifications),
    ).compile();

    app = configureApp(
      moduleFixture.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
    http = app.getHttpServer();

    serviceOrderId = await openServiceOrderAwaitingApproval();
  });

  afterEach(async () => {
    await app.close();
  });

  const openServiceOrderAwaitingApproval = async (): Promise<string> => {
    const client = await request(http)
      .post('/api/v1/clients')
      .send({
        name: 'Maria Silva',
        document: '529.982.247-25',
        email: 'maria@example.com',
        phone: '(11) 99999-8888',
      })
      .expect(201);

    const vehicle = await request(http)
      .post('/api/v1/vehicles')
      .send({
        clientId: client.body.id,
        plate: 'ABC1D23',
        brand: 'Fiat',
        model: 'Argo',
        year: 2022,
      })
      .expect(201);

    const serviceOrder = await request(http)
      .post('/api/v1/service-orders')
      .send({
        clientId: client.body.id,
        vehicleId: vehicle.body.id,
        description: 'Barulho no motor',
      })
      .expect(201);

    const id = serviceOrder.body.id as string;

    // Para em IN_DIAGNOSIS de propósito: quem move a OS para
    // AWAITING_APPROVAL é a política de geração do orçamento.
    await request(http)
      .patch(`/api/v1/service-orders/${id}/assign`)
      .send({ mechanicId: 'cccccccc-1c2e-4f5a-8b9c-0d1e2f3a4b5c' })
      .expect(200);

    return id;
  };

  const createBudget = async () => {
    const response = await request(http)
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

  it('queues every first-budget item in BRL without failing HTTP creation when notification delivery fails', async () => {
    await createBudget();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.BUDGET_READY,
        to: 'maria@example.com',
        subject: expect.stringContaining(serviceOrderId),
        text: expect.stringContaining('Oil change'),
        html: expect.stringContaining('Oil change'),
      }),
    );

    const message = notifications.enqueue.mock.calls[0][0] as {
      text: string;
      html: string;
    };
    expect(message.text).toContain('Oil filter');
    expect(message.text).toContain('R$ 120,00');
    expect(message.text).toContain('R$ 40,00');
    expect(message.text).toContain('R$ 160,00');
    expect(message.html).toContain('Oil filter');
    expect(message.html).toContain('R$ 120,00');
    expect(message.html).toContain('R$ 40,00');
    expect(message.html).toContain('R$ 160,00');
  });

  it('creates, sends, accepts, and fetches a budget', async () => {
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
      .get('/api/v1/budgets')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0].id).toBe(create.body.id);
      });

    await request(http)
      .get(`/api/v1/budgets/service-orders/${serviceOrderId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0].id).toBe(create.body.id);
      });
  });

  it('filters budgets by serviceOrderId query string', async () => {
    const firstBudget = await createBudget();
    const firstServiceOrderId = serviceOrderId;
    await app.get(BudgetRepository).create(
      Budget.create({
        serviceOrderId: 'another-service-order',
        version: 1,
        items: [
          {
            description: 'Brake adjustment',
            type: BudgetItemType.SERVICE,
            quantity: 1,
            unitPrice: Money.fromDecimal(180),
          },
        ],
      }),
    );

    await request(http)
      .get(`/api/v1/budgets?serviceOrderId=${firstServiceOrderId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0].id).toBe(firstBudget.id);
        expect(body[0].serviceOrderId).toBe(firstServiceOrderId);
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
        serviceOrderId,
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
        serviceOrderId,
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

  it('rejects budget service-order list requests without a valid service order id', async () => {
    await request(http).get('/api/v1/budgets').expect(200);
    await request(http).get('/api/v1/budgets/service-orders/').expect(400);
    await request(http)
      .get('/api/v1/budgets/service-orders/%20%20%20')
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
        expect(body.status).toBe('BUDGET_REFUSED');
        expect(body.refusalReason).toBe('Customer found it expensive');
      });

    await request(http)
      .get(`/api/v1/budgets/${id}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('BUDGET_REFUSED');
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

describe('Budget notification delivery resilience (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;
  let emailSender: { send: jest.Mock };
  let serviceOrderId: string;

  beforeEach(async () => {
    emailSender = {
      send: jest
        .fn()
        .mockRejectedValueOnce(new Error('SMTP temporarily unavailable'))
        .mockResolvedValueOnce(undefined),
    };
    const moduleFixture: TestingModule = await allowAuthenticated(
      Test.createTestingModule({ imports: [AppModule] }),
    )
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(BudgetRepository)
      .useValue(new InMemoryBudgetRepository())
      .overrideProvider(ClientRepository)
      .useValue(new InMemoryClientRepository())
      .overrideProvider(VehicleRepository)
      .useValue(new InMemoryVehicleRepository())
      .overrideProvider(ServiceOrderRepository)
      .useValue(new InMemoryServiceOrderRepository())
      .overrideProvider(NotificationRepository)
      .useValue(new InMemoryNotificationRepository())
      .overrideProvider(EmailSender)
      .useValue(emailSender)
      .compile();

    app = configureApp(
      moduleFixture.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
    http = app.getHttpServer();

    const client = await request(http)
      .post('/api/v1/clients')
      .send({
        name: 'Maria Silva',
        document: '529.982.247-25',
        email: 'maria@example.com',
        phone: '(11) 99999-8888',
      })
      .expect(201);
    const vehicle = await request(http)
      .post('/api/v1/vehicles')
      .send({
        clientId: client.body.id,
        plate: 'ABC1D23',
        brand: 'Fiat',
        model: 'Argo',
        year: 2022,
      })
      .expect(201);
    const serviceOrder = await request(http)
      .post('/api/v1/service-orders')
      .send({
        clientId: client.body.id,
        vehicleId: vehicle.body.id,
        description: 'Barulho no motor',
      })
      .expect(201);
    serviceOrderId = serviceOrder.body.id as string;

    await request(http)
      .patch(`/api/v1/service-orders/${serviceOrderId}/assign`)
      .send({ mechanicId: 'cccccccc-1c2e-4f5a-8b9c-0d1e2f3a4b5c' })
      .expect(200);
  });

  afterEach(async () => {
    await app.close();
  });

  it('keeps budget creation successful after an email failure and sends the stored notification on retry', async () => {
    await request(http)
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

    await new Promise<void>((resolve) => setImmediate(resolve));

    const failed = await request(http)
      .get('/api/v1/notifications?status=FAILED')
      .expect(200);

    expect(failed.body).toEqual([
      expect.objectContaining({
        status: 'FAILED',
        attempts: 1,
        lastError: 'SMTP temporarily unavailable',
      }),
    ]);

    await request(http)
      .post(`/api/v1/notifications/${failed.body[0].id}/retry`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.objectContaining({
            status: 'SENT',
            attempts: 2,
            lastError: null,
          }),
        );
      });

    expect(emailSender.send).toHaveBeenCalledTimes(2);
  });
});

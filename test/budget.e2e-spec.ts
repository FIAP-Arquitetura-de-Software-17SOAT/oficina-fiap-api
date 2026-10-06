import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { listenOnLoopback } from './listen-on-loopback';
import { AppModule } from '../src/app.module';
import {
  Budget,
  BudgetItemType,
} from '../src/modules/budget/domain/entities/budget.entity';
import { Money } from '../src/shared/domain/value-objects/money.vo';
import { BudgetRepositoryPort } from '../src/modules/budget/application/ports/budget-repository.port';
import { ClientRepositoryPort } from '../src/modules/client/application/ports/client-repository.port';
import { NotificationType } from '../src/modules/notification/domain/enums/notification-type.enum';
import { NotificationRepositoryPort } from '../src/modules/notification/application/ports/notification-repository.port';
import { EnqueueNotificationUseCase } from '../src/modules/notification/application/use-cases/enqueue-notification.use-case';
import { ServiceOrderRepositoryPort } from '../src/modules/service-order/application/ports/service-order-repository.port';
import { VehicleRepositoryPort } from '../src/modules/vehicle/application/ports/vehicle-repository.port';
import { PartRepositoryPort } from '../src/modules/stock/application/ports/part-repository.port';
import { PrismaService } from '../src/shared/database/prisma.service';
import { configureApp } from '../src/setup-app';
import { InMemoryBudgetRepository } from './in-memory-budget.repository';
import { InMemoryClientRepository } from './in-memory-client.repository';
import { InMemoryServiceOrderRepository } from './in-memory-service-order.repository';
import { InMemoryVehicleRepository } from './in-memory-vehicle.repository';
import { InMemoryNotificationRepository } from './in-memory-notification.repository';
import { InMemoryPartRepository } from './in-memory-part.repository';
import { allowAuthenticated } from './allow-authenticated';
import { EmailSenderPort } from '../src/modules/notification/application/ports/email-sender.port';

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

  it('lists budgets newest version first regardless of insertion order', async () => {
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
          partId: 'bbbbbbbb-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
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

    expect(budgets.map((budget) => budget.getVersion())).toEqual([3, 1]);
  });
});

describe('Budget (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;
  let notifications: { execute: jest.Mock };
  // Aceitar ou recusar um orcamento mexe na ordem de servico, entao o cenario
  // minimo agora inclui cliente, veiculo e uma OS aguardando aprovacao.
  let serviceOrderId: string;
  // Item de peça só existe apontando para uma peça do estoque, então o cenário
  // cadastra uma antes de orçar.
  let partId: string;
  let parts: InMemoryPartRepository;

  beforeEach(async () => {
    parts = new InMemoryPartRepository();
    notifications = {
      // A rejeição simula a falha de entrega/filas sem permitir que ela altere
      // a resposta HTTP da criação do orçamento.
      execute: jest
        .fn()
        .mockRejectedValue(new Error('notification unavailable')),
    };
    const moduleFixture: TestingModule = await allowAuthenticated(
      Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(PrismaService)
        .useValue({})
        .overrideProvider(BudgetRepositoryPort)
        .useValue(new InMemoryBudgetRepository())
        .overrideProvider(PartRepositoryPort)
        .useValue(parts)
        .overrideProvider(ClientRepositoryPort)
        .useValue(new InMemoryClientRepository())
        .overrideProvider(VehicleRepositoryPort)
        .useValue(new InMemoryVehicleRepository())
        .overrideProvider(ServiceOrderRepositoryPort)
        .useValue(new InMemoryServiceOrderRepository())
        .overrideProvider(EnqueueNotificationUseCase)
        .useValue(notifications),
    ).compile();

    app = configureApp(
      moduleFixture.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
    http = await listenOnLoopback(app);

    serviceOrderId = await openServiceOrderAwaitingApproval();
    partId = parts.seed().getId();
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
            partId,
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

  it('does not email the budget while it is only generated', async () => {
    await createBudget();
    await new Promise<void>((resolve) => setImmediate(resolve));

    // A OS já avisou o cliente da mudança de status; o que não pode sair
    // ainda é o email do orçamento, cujo link só vale depois do envio.
    expect(notifications.execute).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: NotificationType.BUDGET_READY }),
    );
  });

  it('queues every budget item in BRL, with the approval link, when the budget is sent', async () => {
    const { id } = await createBudget();
    await request(http).post(`/api/v1/budgets/${id}/send`).expect(200);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(notifications.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.BUDGET_READY,
        to: 'maria@example.com',
        subject: expect.stringContaining(serviceOrderId),
        text: expect.stringContaining('Oil change'),
        html: expect.stringContaining('Oil change'),
      }),
    );

    const [message] =
      (
        notifications.execute.mock.calls as [
          { type: NotificationType; text: string; html: string },
        ][]
      ).find(([input]) => input.type === NotificationType.BUDGET_READY) ?? [];
    if (!message) throw new Error('BUDGET_READY notification was not queued');
    expect(message.text).toContain('Oil filter');
    expect(message.text).toContain('R$ 120,00');
    expect(message.text).toContain('R$ 40,00');
    expect(message.text).toContain('R$ 160,00');
    expect(message.html).toContain('Oil filter');
    expect(message.html).toContain('R$ 120,00');
    expect(message.html).toContain('R$ 40,00');
    expect(message.html).toContain('R$ 160,00');
    expect(message.text).toMatch(
      /budgets\/webhooks\/decision\?token=[A-Za-z0-9_-]{43}/,
    );
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
        partId,
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
      .get(`/api/v1/budgets?serviceOrderId=${serviceOrderId}`)
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
        serviceOrderId,
        items: [
          {
            description: 'Precision overflow',
            type: 'SERVICE',
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
            type: 'SERVICE',
            quantity: 1,
            unitPrice: 100_000_000,
          },
        ],
      })
      .expect(400);
  });

  it('rejects a malformed service order filter instead of ignoring it', async () => {
    // Sem filtro a listagem inteira é resposta legítima; filtro presente e
    // inválido é erro. O que não pode voltar é 200 com a lista toda, que era o
    // que acontecia quando `findAll` não tinha `@Query` e a query era ignorada.
    await request(http).get('/api/v1/budgets').expect(200);
    await request(http).get('/api/v1/budgets?serviceOrderId=').expect(400);
    await request(http)
      .get('/api/v1/budgets?serviceOrderId=%20%20%20')
      .expect(400);
    await request(http)
      .get('/api/v1/budgets?serviceOrderId=nao-e-uuid')
      .expect(400);
    await request(http).get('/api/v1/budgets?filtroInexistente=1').expect(400);
  });

  it('rejects item changes after send and all changes after acceptance', async () => {
    const { id, itemId } = await createBudget();

    await request(http).post(`/api/v1/budgets/${id}/send`).expect(200);

    await request(http)
      .post(`/api/v1/budgets/${id}/items`)
      .send({
        partId,
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
        partId,
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
        partId,
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
    emailSender = { send: jest.fn().mockResolvedValue(undefined) };
    const moduleFixture: TestingModule = await allowAuthenticated(
      Test.createTestingModule({ imports: [AppModule] }),
    )
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(BudgetRepositoryPort)
      .useValue(new InMemoryBudgetRepository())
      .overrideProvider(PartRepositoryPort)
      .useValue(new InMemoryPartRepository())
      .overrideProvider(ClientRepositoryPort)
      .useValue(new InMemoryClientRepository())
      .overrideProvider(VehicleRepositoryPort)
      .useValue(new InMemoryVehicleRepository())
      .overrideProvider(ServiceOrderRepositoryPort)
      .useValue(new InMemoryServiceOrderRepository())
      .overrideProvider(NotificationRepositoryPort)
      .useValue(new InMemoryNotificationRepository())
      .overrideProvider(EmailSenderPort)
      .useValue(emailSender)
      .compile();

    app = configureApp(
      moduleFixture.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
    http = await listenOnLoopback(app);

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

    // A atribuição já avisa o cliente da mudança de status. A falha de SMTP que
    // este teste exercita é a do email do orçamento, então ela entra agora.
    await new Promise<void>((resolve) => setImmediate(resolve));
    emailSender.send
      .mockReset()
      .mockRejectedValueOnce(new Error('SMTP temporarily unavailable'))
      .mockResolvedValueOnce(undefined);
  });

  afterEach(async () => {
    await app.close();
  });

  it('keeps budget sending successful after an email failure and sends the stored notification on retry', async () => {
    const created = await request(http)
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
    await request(http)
      .post(`/api/v1/budgets/${created.body.id}/send`)
      .expect(200);

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

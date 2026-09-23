import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { BudgetRepository } from '../src/modules/budget/repositories/budget.repository';
import {
  BUDGET_WEBHOOK_SIGNATURE_HEADER,
  BUDGET_WEBHOOK_TIMESTAMP_HEADER,
  signBudgetWebhook,
} from '../src/modules/budget/webhooks/budget-webhook-signature.guard';
import { ClientRepository } from '../src/modules/client/repositories/client.repository';
import { NotificationService } from '../src/modules/notification/services/notification.service';
import { ServiceOrderRepository } from '../src/modules/service-order/repositories/service-order.repository';
import { VehicleRepository } from '../src/modules/vehicle/repositories/vehicle.repository';
import { PrismaService } from '../src/shared/database/prisma.service';
import { configureApp } from '../src/setup-app';
import { allowAuthenticated } from './allow-authenticated';
import { InMemoryBudgetRepository } from './in-memory-budget.repository';
import { InMemoryClientRepository } from './in-memory-client.repository';
import { InMemoryServiceOrderRepository } from './in-memory-service-order.repository';
import { InMemoryVehicleRepository } from './in-memory-vehicle.repository';

const SECRET = 'e2e-budget-webhook-secret';
const WEBHOOK = '/api/v1/budgets/webhooks/decision';

/**
 * O webhook com corpo bruto e assinatura de verdade. O resto do fluxo (abrir
 * OS, gerar e enviar orçamento) usa o atalho de autenticação dos outros e2e;
 * a rota do webhook é pública e não depende dele.
 */
describe('Budget decision webhook (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;
  let serviceOrderId: string;
  let budgetId: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await allowAuthenticated(
      Test.createTestingModule({ imports: [AppModule] }),
    )
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(ClientRepository)
      .useValue(new InMemoryClientRepository())
      .overrideProvider(VehicleRepository)
      .useValue(new InMemoryVehicleRepository())
      .overrideProvider(ServiceOrderRepository)
      .useValue(new InMemoryServiceOrderRepository())
      .overrideProvider(BudgetRepository)
      .useValue(new InMemoryBudgetRepository())
      .overrideProvider(NotificationService)
      .useValue({ enqueue: jest.fn() })
      .compile();

    app = configureApp(
      moduleFixture.createNestApplication({ rawBody: true }),
    ) as INestApplication<App>;
    await app.init();
    http = app.getHttpServer();

    ({ serviceOrderId, budgetId } = await budgetWaitingApproval());
  });

  afterEach(async () => {
    await app.close();
  });

  async function budgetWaitingApproval() {
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
    const order = await request(http)
      .post('/api/v1/service-orders')
      .send({
        clientId: client.body.id,
        vehicleId: vehicle.body.id,
        description: 'Barulho no motor',
      })
      .expect(201);
    await request(http)
      .patch(`/api/v1/service-orders/${order.body.id}/assign`)
      .send({ mechanicId: 'cccccccc-1c2e-4f5a-8b9c-0d1e2f3a4b5c' })
      .expect(200);
    const budget = await request(http)
      .post('/api/v1/budgets')
      .send({
        serviceOrderId: order.body.id,
        items: [
          {
            description: 'Troca de óleo',
            type: 'SERVICE',
            quantity: 1,
            unitPrice: 120,
          },
        ],
      })
      .expect(201);
    await request(http)
      .post(`/api/v1/budgets/${budget.body.id}/send`)
      .expect(200);

    return {
      serviceOrderId: order.body.id as string,
      budgetId: budget.body.id as string,
    };
  }

  const deliver = (
    payload: Record<string, unknown>,
    options: { secret?: string; timestamp?: number } = {},
  ) => {
    const body = JSON.stringify(payload);
    const timestamp = String(
      options.timestamp ?? Math.floor(Date.now() / 1000),
    );

    return request(http)
      .post(WEBHOOK)
      .set('Content-Type', 'application/json')
      .set(BUDGET_WEBHOOK_TIMESTAMP_HEADER, timestamp)
      .set(
        BUDGET_WEBHOOK_SIGNATURE_HEADER,
        signBudgetWebhook(
          options.secret ?? SECRET,
          timestamp,
          Buffer.from(body),
        ),
      )
      .send(body);
  };

  const orderStatus = async () =>
    (await request(http).get(`/api/v1/service-orders/${serviceOrderId}`)).body
      .status as string;

  it('aprovação aceita o orçamento e move a OS para aguardando peças', async () => {
    const response = await deliver({ budgetId, decision: 'APPROVED' }).expect(
      200,
    );

    expect(response.body.status).toBe('ACCEPTED');
    expect(await orderStatus()).toBe('AWAITING_PARTS');
  });

  it('recusa grava o motivo e mantém a OS aguardando aprovação', async () => {
    const response = await deliver({
      budgetId,
      decision: 'REFUSED',
      reason: 'Achei caro',
    }).expect(200);

    expect(response.body).toMatchObject({
      status: 'REFUSED',
      refusalReason: 'Achei caro',
    });
    expect(await orderStatus()).toBe('AWAITING_APPROVAL');
  });

  it('reentrega da mesma decisão responde 200 sem repetir efeitos', async () => {
    await deliver({ budgetId, decision: 'APPROVED' }).expect(200);

    const replay = await deliver({ budgetId, decision: 'APPROVED' }).expect(
      200,
    );

    expect(replay.body.status).toBe('ACCEPTED');
    expect(await orderStatus()).toBe('AWAITING_PARTS');
  });

  it('decisão contrária à já registrada responde 409', async () => {
    await deliver({ budgetId, decision: 'APPROVED' }).expect(200);

    await deliver({ budgetId, decision: 'REFUSED', reason: 'x' }).expect(409);
  });

  it('recusa sem motivo responde 400', async () => {
    await deliver({ budgetId, decision: 'REFUSED' }).expect(400);
  });

  it('orçamento inexistente responde 404', async () => {
    await deliver({
      budgetId: 'a1b2c3d4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      decision: 'APPROVED',
    }).expect(404);
  });

  it('corpo inválido, mas assinado, responde 400', async () => {
    await deliver({ budgetId, decision: 'MAYBE' }).expect(400);
  });

  describe('autenticação', () => {
    it('não exige token de acesso', async () => {
      const response = await deliver({ budgetId, decision: 'APPROVED' });

      expect(response.status).toBe(200);
    });

    it('assinatura com outro segredo responde 401 e não altera nada', async () => {
      await deliver(
        { budgetId, decision: 'APPROVED' },
        { secret: 'segredo-errado' },
      ).expect(401);

      expect(await orderStatus()).toBe('AWAITING_APPROVAL');
    });

    it('sem assinatura responde 401, antes mesmo de validar o corpo', async () => {
      await request(http).post(WEBHOOK).send({ decision: 'MAYBE' }).expect(401);
    });

    it('timestamp de mais de 5 minutos responde 401', async () => {
      await deliver(
        { budgetId, decision: 'APPROVED' },
        { timestamp: Math.floor(Date.now() / 1000) - 600 },
      ).expect(401);
    });
  });
});

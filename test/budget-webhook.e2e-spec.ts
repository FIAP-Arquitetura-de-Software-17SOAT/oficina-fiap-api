import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { BudgetRepository } from '../src/modules/budget/repositories/budget.repository';
import { ClientRepository } from '../src/modules/client/repositories/client.repository';
import { NotificationType } from '../src/modules/notification/enums/notification-type.enum';
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

const WEBHOOK = '/api/v1/budgets/webhooks/decision';

/**
 * A aprovação do orçamento pelo link do email, de ponta a ponta: o envio
 * manda o link, o GET mostra a página sem decidir nada e o POST com o token
 * decide. O resto do fluxo usa o atalho de autenticação dos outros e2e; as
 * rotas do link são públicas e não dependem dele.
 */
describe('Budget approval link and webhook (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;
  let notifications: { enqueue: jest.Mock };
  let serviceOrderId: string;
  let budgetId: string;
  let token: string;
  let approvalUrl: string;

  beforeEach(async () => {
    notifications = { enqueue: jest.fn() };
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
      .useValue(notifications)
      .compile();

    app = configureApp(
      moduleFixture.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
    http = app.getHttpServer();

    await sendBudget();
  });

  afterEach(async () => {
    await app.close();
  });

  async function sendBudget() {
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
    await new Promise((resolve) => setImmediate(resolve));

    serviceOrderId = order.body.id as string;
    budgetId = budget.body.id as string;

    const [email] =
      (
        notifications.enqueue.mock.calls as [
          { type: NotificationType; to: string; text: string },
        ][]
      ).find(([input]) => input.type === NotificationType.BUDGET_READY) ?? [];
    if (!email) throw new Error('budget email was not queued');

    approvalUrl = /(http\S+decision\?token=\S+)/.exec(email.text)?.[1] ?? '';
    token = new URL(approvalUrl).searchParams.get('token') ?? '';
  }

  const orderStatus = async () =>
    (await request(http).get(`/api/v1/service-orders/${serviceOrderId}`)).body
      .status as string;
  const budgetStatus = async () =>
    (await request(http).get(`/api/v1/budgets/${budgetId}`)).body
      .status as string;

  describe('email do orçamento', () => {
    it('manda ao cliente o link pessoal da página de confirmação', () => {
      expect(approvalUrl).toMatch(
        /^http:\/\/localhost:3000\/api\/v1\/budgets\/webhooks\/decision\?token=[A-Za-z0-9_-]{43}$/,
      );
    });
  });

  describe('GET do link', () => {
    it('mostra o orçamento com os botões, sem decidir nada', async () => {
      const page = await request(http)
        .get(WEBHOOK)
        .query({ token })
        .expect(200)
        .expect('Content-Type', /text\/html/);

      expect(page.text).toContain('Troca de óleo');
      expect(page.text).toContain('R$');
      expect(page.text).toContain('value="APPROVED"');
      expect(page.text).toContain('value="REFUSED"');
      expect(await budgetStatus()).toBe('WAITING_APPROVAL');
    });

    it('não deixa o token vazar nem a página ser embutida', async () => {
      await request(http)
        .get(WEBHOOK)
        .query({ token })
        .expect('Referrer-Policy', 'no-referrer')
        .expect('X-Frame-Options', 'DENY')
        .expect('Cache-Control', 'no-store');
    });

    it('link inválido mostra página de erro 404', async () => {
      const page = await request(http)
        .get(WEBHOOK)
        .query({ token: 'A'.repeat(43) })
        .expect(404);

      expect(page.text).toContain('Link inválido');
    });
  });

  describe('POST do formulário da página', () => {
    it('aprovar aceita o orçamento e responde uma página', async () => {
      const page = await request(http)
        .post(WEBHOOK)
        .set('Accept', 'text/html')
        .type('form')
        .send({ token, decision: 'APPROVED' })
        .expect(200)
        .expect('Content-Type', /text\/html/);

      expect(page.text).toContain('Orçamento aprovado');
      expect(await budgetStatus()).toBe('ACCEPTED');
      expect(await orderStatus()).toBe('AWAITING_PARTS');
    });

    it('recusar grava o motivo', async () => {
      await request(http)
        .post(WEBHOOK)
        .set('Accept', 'text/html')
        .type('form')
        .send({ token, decision: 'REFUSED', reason: 'Achei caro' })
        .expect(200);

      const budget = await request(http).get(`/api/v1/budgets/${budgetId}`);
      expect(budget.body).toMatchObject({
        status: 'REFUSED',
        refusalReason: 'Achei caro',
      });
    });
  });

  describe('POST em JSON (webhook)', () => {
    it('aprova com o token do email', async () => {
      const response = await request(http)
        .post(WEBHOOK)
        .send({ token, decision: 'APPROVED' })
        .expect(200);

      expect(response.body.status).toBe('ACCEPTED');
    });

    it('o id do orçamento não serve de token', async () => {
      await request(http)
        .post(WEBHOOK)
        .send({ token: budgetId, decision: 'APPROVED' })
        .expect(404);

      expect(await budgetStatus()).toBe('WAITING_APPROVAL');
    });

    it('sem token responde 400', async () => {
      await request(http)
        .post(WEBHOOK)
        .send({ decision: 'APPROVED' })
        .expect(400);
    });

    it('recusa sem motivo responde 400', async () => {
      await request(http)
        .post(WEBHOOK)
        .send({ token, decision: 'REFUSED' })
        .expect(400);
    });

    it('reentrega da mesma decisão responde 200 sem repetir efeitos', async () => {
      await request(http)
        .post(WEBHOOK)
        .send({ token, decision: 'APPROVED' })
        .expect(200);

      await request(http)
        .post(WEBHOOK)
        .send({ token, decision: 'APPROVED' })
        .expect(200);
      expect(await orderStatus()).toBe('AWAITING_PARTS');
    });

    it('decisão contrária à já registrada responde 409', async () => {
      await request(http)
        .post(WEBHOOK)
        .send({ token, decision: 'APPROVED' })
        .expect(200);

      await request(http)
        .post(WEBHOOK)
        .send({ token, decision: 'REFUSED', reason: 'x' })
        .expect(409);
    });

    it('depois de respondido, o link mostra a decisão em vez dos botões', async () => {
      await request(http)
        .post(WEBHOOK)
        .send({ token, decision: 'APPROVED' })
        .expect(200);

      const page = await request(http)
        .get(WEBHOOK)
        .query({ token })
        .expect(200);
      expect(page.text).toContain('já foi aprovado');
      expect(page.text).not.toContain('value="APPROVED"');
    });
  });
});

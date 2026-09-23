import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { BudgetRepository } from '../src/modules/budget/repositories/budget.repository';
import { ClientRepository } from '../src/modules/client/repositories/client.repository';
import { NotificationService } from '../src/modules/notification/services/notification.service';
import { ServiceOrderRepository } from '../src/modules/service-order/repositories/service-order.repository';
import { VehicleRepository } from '../src/modules/vehicle/repositories/vehicle.repository';
import { PrismaService } from '../src/shared/database/prisma.service';
import { User } from '../src/shared/identity/entities/user.entity';
import { RefreshSessionRepository } from '../src/shared/identity/repositories/refresh-session.repository';
import { UserRepository } from '../src/shared/identity/repositories/user.repository';
import { PasswordHashService } from '../src/shared/identity/services/password-hash.service';
import { configureApp } from '../src/setup-app';
import { InMemoryBudgetRepository } from './in-memory-budget.repository';
import { InMemoryClientRepository } from './in-memory-client.repository';
import {
  InMemoryIdentityPrisma,
  InMemoryRefreshSessionRepository,
  InMemoryUserRepository,
} from './in-memory-identity.repository';
import { InMemoryServiceOrderRepository } from './in-memory-service-order.repository';
import { InMemoryVehicleRepository } from './in-memory-vehicle.repository';

const ADMIN_EMAIL = 'admin@example.com';
const PASSWORD = 'correct-horse-battery-staple';
const CUSTOMER_PASSWORD = 'senha-da-maria-123';

/**
 * O CUSTOMER com token de verdade: guard JWT e RolesGuard rodando, sem o
 * atalho do allowAuthenticated. O cliente acompanha as próprias OS e responde
 * o próprio orçamento, e não enxerga nada de outro cliente.
 */
describe('CUSTOMER (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;
  let adminToken: string;
  let customerToken: string;
  let mariaId: string;
  let mariaOrderId: string;
  let joaoOrderId: string;

  beforeEach(async () => {
    const passwordHash = new PasswordHashService();
    const users = new InMemoryUserRepository();
    const sessions = new InMemoryRefreshSessionRepository();
    users.reset([
      User.create({
        email: ADMIN_EMAIL,
        passwordHash: await passwordHash.hash(PASSWORD),
        role: 'ADMIN',
      }),
    ]);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(new InMemoryIdentityPrisma(sessions.sessions))
      .overrideProvider(UserRepository)
      .useValue(users)
      .overrideProvider(RefreshSessionRepository)
      .useValue(sessions)
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
      moduleFixture.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
    http = app.getHttpServer();

    adminToken = await login(ADMIN_EMAIL, PASSWORD);

    const maria = await openOrderFor({
      name: 'Maria Silva',
      document: '529.982.247-25',
      email: 'Maria@Example.com',
      phone: '(11) 99999-8888',
      plate: 'ABC1D23',
    });
    const joao = await openOrderFor({
      name: 'João Souza',
      document: '111.444.777-35',
      email: 'joao@example.com',
      phone: '(11) 98888-7777',
      plate: 'XYZ9A87',
    });
    mariaId = maria.clientId;
    mariaOrderId = maria.orderId;
    joaoOrderId = joao.orderId;

    await asAdmin(
      request(http)
        .post(`/api/v1/clients/${mariaId}/account`)
        .send({ password: CUSTOMER_PASSWORD }),
    ).expect(201);
    customerToken = await login('maria@example.com', CUSTOMER_PASSWORD);
  });

  afterEach(async () => {
    await app.close();
  });

  async function login(email: string, password: string): Promise<string> {
    const response = await request(http)
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    return response.body.accessToken as string;
  }

  const asAdmin = (test: request.Test) =>
    test.set('Authorization', `Bearer ${adminToken}`);
  const asCustomer = (test: request.Test) =>
    test.set('Authorization', `Bearer ${customerToken}`);

  async function openOrderFor(data: {
    name: string;
    document: string;
    email: string;
    phone: string;
    plate: string;
  }): Promise<{ clientId: string; orderId: string }> {
    const client = await asAdmin(
      request(http).post('/api/v1/clients').send({
        name: data.name,
        document: data.document,
        email: data.email,
        phone: data.phone,
      }),
    ).expect(201);
    const vehicle = await asAdmin(
      request(http).post('/api/v1/vehicles').send({
        clientId: client.body.id,
        plate: data.plate,
        brand: 'Fiat',
        model: 'Argo',
        year: 2022,
      }),
    ).expect(201);
    const order = await asAdmin(
      request(http).post('/api/v1/service-orders').send({
        clientId: client.body.id,
        vehicleId: vehicle.body.id,
        description: 'Barulho no motor',
      }),
    ).expect(201);

    return {
      clientId: client.body.id as string,
      orderId: order.body.id as string,
    };
  }

  async function budgetWaitingApproval(orderId: string): Promise<string> {
    await asAdmin(
      request(http)
        .patch(`/api/v1/service-orders/${orderId}/assign`)
        .send({ mechanicId: randomUUID() }),
    ).expect(200);
    const budget = await asAdmin(
      request(http)
        .post('/api/v1/budgets')
        .send({
          serviceOrderId: orderId,
          items: [
            {
              description: 'Troca de óleo',
              type: 'SERVICE',
              quantity: 1,
              unitPrice: 120,
            },
          ],
        }),
    ).expect(201);
    await asAdmin(
      request(http).post(`/api/v1/budgets/${budget.body.id}/send`),
    ).expect(200);

    return budget.body.id as string;
  }

  describe('login do cliente', () => {
    it('usa o email do cadastro e não pode ser criado duas vezes', async () => {
      await asAdmin(
        request(http)
          .post(`/api/v1/clients/${mariaId}/account`)
          .send({ password: CUSTOMER_PASSWORD }),
      ).expect(409);
    });

    it('só a oficina cria login de cliente', async () => {
      await asCustomer(
        request(http)
          .post(`/api/v1/clients/${mariaId}/account`)
          .send({ password: CUSTOMER_PASSWORD }),
      ).expect(403);
    });
  });

  describe('ordens de serviço', () => {
    it('lista só as OS do próprio cliente, com o status', async () => {
      const response = await asCustomer(
        request(http).get('/api/v1/service-orders/mine'),
      ).expect(200);

      expect(response.body).toEqual([
        expect.objectContaining({ id: mariaOrderId, status: 'RECEIVED' }),
      ]);
    });

    it('consulta a própria OS por id', async () => {
      await asCustomer(
        request(http).get(`/api/v1/service-orders/${mariaOrderId}`),
      ).expect(200);
    });

    it('OS de outro cliente responde 404', async () => {
      await asCustomer(
        request(http).get(`/api/v1/service-orders/${joaoOrderId}`),
      ).expect(404);
    });

    it.each([
      ['get', '/api/v1/service-orders'],
      ['post', '/api/v1/service-orders'],
      ['get', '/api/v1/clients'],
      ['get', '/api/v1/service-orders/metrics/average-execution-time'],
    ] as const)('%s %s é só da oficina', async (method, path) => {
      await asCustomer(request(http)[method](path)).expect(403);
    });

    it('a rota /mine é só do cliente', async () => {
      await asAdmin(request(http).get('/api/v1/service-orders/mine')).expect(
        403,
      );
    });
  });

  describe('orçamento', () => {
    it('lista, consulta e aceita o orçamento da própria OS', async () => {
      const budgetId = await budgetWaitingApproval(mariaOrderId);

      const listed = await asCustomer(
        request(http).get(`/api/v1/budgets?serviceOrderId=${mariaOrderId}`),
      ).expect(200);
      expect(listed.body).toEqual([expect.objectContaining({ id: budgetId })]);

      await asCustomer(request(http).get(`/api/v1/budgets/${budgetId}`)).expect(
        200,
      );

      const accepted = await asCustomer(
        request(http).post(`/api/v1/budgets/${budgetId}/accept`),
      ).expect(200);
      expect(accepted.body.status).toBe('ACCEPTED');

      const order = await asCustomer(
        request(http).get(`/api/v1/service-orders/${mariaOrderId}`),
      ).expect(200);
      expect(order.body.status).toBe('AWAITING_PARTS');
    });

    it('recusa o orçamento da própria OS', async () => {
      const budgetId = await budgetWaitingApproval(mariaOrderId);

      const refused = await asCustomer(
        request(http)
          .post(`/api/v1/budgets/${budgetId}/refuse`)
          .send({ reason: 'Achei caro' }),
      ).expect(200);

      expect(refused.body).toMatchObject({
        status: 'REFUSED',
        refusalReason: 'Achei caro',
      });
    });

    it('orçamento de outro cliente responde 404, inclusive ao aceitar', async () => {
      const budgetId = await budgetWaitingApproval(joaoOrderId);

      await asCustomer(request(http).get(`/api/v1/budgets/${budgetId}`)).expect(
        404,
      );
      await asCustomer(
        request(http).post(`/api/v1/budgets/${budgetId}/accept`),
      ).expect(404);
      await asCustomer(
        request(http)
          .post(`/api/v1/budgets/${budgetId}/refuse`)
          .send({ reason: 'x' }),
      ).expect(404);
      await asCustomer(
        request(http).get(`/api/v1/budgets?serviceOrderId=${joaoOrderId}`),
      ).expect(404);
    });

    it('precisa informar a OS para listar orçamentos', async () => {
      await asCustomer(request(http).get('/api/v1/budgets')).expect(400);
    });

    it('não gera nem envia orçamento', async () => {
      await asCustomer(request(http).post('/api/v1/budgets').send({})).expect(
        403,
      );
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PaymentMethod } from '../src/modules/billing/enums/payment-method.enum';
import { FakePaymentGateway } from '../src/modules/billing/gateways/fake-payment.gateway';
import { PaymentGateway } from '../src/modules/billing/gateways/payment-gateway';
import { BillingRepository } from '../src/modules/billing/repositories/billing.repository';
import { BillingService } from '../src/modules/billing/services/billing.service';
import { BudgetRepository } from '../src/modules/budget/repositories/budget.repository';
import { ClientRepository } from '../src/modules/client/repositories/client.repository';
import { NotificationType } from '../src/modules/notification/enums/notification-type.enum';
import { NotificationService } from '../src/modules/notification/services/notification.service';
import { ServiceOrderRepository } from '../src/modules/service-order/repositories/service-order.repository';
import { VehicleRepository } from '../src/modules/vehicle/repositories/vehicle.repository';
import { PrismaService } from '../src/shared/database/prisma.service';
import { configureApp } from '../src/setup-app';
import { allowAuthenticated } from './allow-authenticated';
import { InMemoryBillingRepository } from './in-memory-billing.repository';
import { InMemoryBudgetRepository } from './in-memory-budget.repository';
import { InMemoryClientRepository } from './in-memory-client.repository';
import { InMemoryServiceOrderRepository } from './in-memory-service-order.repository';
import { InMemoryVehicleRepository } from './in-memory-vehicle.repository';

describe('Billing (integracao)', () => {
  let app: INestApplication<App>;
  let http: App;
  let notifications: { enqueue: jest.Mock };
  const jwt = new JwtService();
  let token: string;

  beforeEach(async () => {
    notifications = { enqueue: jest.fn() };
    const moduleFixture: TestingModule = await allowAuthenticated(
      Test.createTestingModule({
        imports: [AppModule],
      }),
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
      .overrideProvider(BillingRepository)
      .useValue(new InMemoryBillingRepository())
      .overrideProvider(PaymentGateway)
      .useValue(new FakePaymentGateway())
      .overrideProvider(NotificationService)
      .useValue(notifications)
      .compile();

    app = configureApp(
      moduleFixture.createNestApplication({ rawBody: true }),
    ) as INestApplication<App>;
    await app.init();
    http = app.getHttpServer();
    token = await jwt.signAsync(
      {
        sub: 'billing-user',
        role: 'ADMIN',
        type: 'access',
        jti: 'billing-jti',
      },
      { secret: 'e2e-access-secret', expiresIn: '15m' },
    );
  });

  afterEach(async () => {
    await app.close();
  });

  async function createCompletedServiceOrderWithAcceptedBudget() {
    const client = await request(http)
      .post('/api/v1/client')
      .send({
        name: 'Maria Silva',
        document: '529.982.247-25',
        email: 'maria@example.com',
        phone: '(11) 99999-8888',
      })
      .expect(201);

    const vehicle = await request(http)
      .post('/api/v1/vehicle')
      .send({
        clientId: client.body.id,
        plate: 'ABC1D23',
        brand: 'Honda',
        model: 'Civic',
        year: 2020,
      })
      .expect(201);

    const serviceOrder = await request(http)
      .post('/api/v1/service-order')
      .send({
        clientId: client.body.id,
        vehicleId: vehicle.body.id,
        description: 'Troca de oleo',
      })
      .expect(201);

    await request(http)
      .patch(`/api/v1/service-order/${serviceOrder.body.id}/assign`)
      .send({ mechanicId: 'cccccccc-1c2e-4f5a-8b9c-0d1e2f3a4b5c' })
      .expect(200);

    async function createAndAcceptBudget(
      description: string,
      unitPrice: number,
    ) {
      const budget = await request(http)
        .post('/api/v1/budgets')
        .send({
          serviceOrderId: serviceOrder.body.id,
          items: [
            {
              description,
              type: 'SERVICE',
              quantity: 1,
              unitPrice,
            },
          ],
        })
        .expect(201);

      await request(http)
        .post(`/api/v1/budgets/${budget.body.id}/send`)
        .expect(200);
      return request(http)
        .post(`/api/v1/budgets/${budget.body.id}/accept`)
        .expect(200);
    }

    const latestBudget = await createAndAcceptBudget('Servico atualizado', 150);
    await request(http)
      .post(`/api/v1/stock/service-orders/${serviceOrder.body.id}/dispatch`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(http)
      .patch(`/api/v1/service-order/${serviceOrder.body.id}/complete`)
      .send()
      .expect(200);

    return {
      serviceOrderId: serviceOrder.body.id as string,
      latestBudget: latestBudget.body,
    };
  }

  it('generates billing from the latest accepted budget without changing it', async () => {
    const { serviceOrderId, latestBudget } =
      await createCompletedServiceOrderWithAcceptedBudget();

    const response = await request(http)
      .post('/api/v1/billings')
      .send({ serviceOrderId })
      .expect(201);

    expect(response.body).toMatchObject({
      serviceOrderId,
      budgetId: latestBudget.id,
      status: 'WAITING_PAYMENT',
      amount: 150,
      paymentLink: expect.stringContaining(
        'https://fake.stripe.test/checkout/',
      ),
      paymentMethod: null,
      paidAt: null,
    });
    expect(response.body.id).not.toBe(serviceOrderId);

    const persistedBudget = await request(http)
      .get(`/api/v1/budgets/${latestBudget.id}`)
      .expect(200);

    expect(persistedBudget.body).toMatchObject({
      id: latestBudget.id,
      version: 1,
      status: 'ACCEPTED',
      totalAmount: 150,
      items: [
        {
          id: latestBudget.items[0].id,
          description: 'Servico atualizado',
          type: 'SERVICE',
          quantity: 1,
          unitPrice: 150,
          subtotal: 150,
        },
      ],
    });
  });

  it('queues the persisted payment link in BRL for the customer', async () => {
    const { serviceOrderId } =
      await createCompletedServiceOrderWithAcceptedBudget();

    const response = await request(http)
      .post('/api/v1/billings')
      .send({ serviceOrderId })
      .expect(201);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.PAYMENT_LINK_READY,
        to: 'maria@example.com',
        text: expect.stringContaining(response.body.paymentLink),
        html: expect.stringContaining(response.body.paymentLink),
      }),
    );
    const message = notifications.enqueue.mock.calls[0][0] as {
      text: string;
      html: string;
    };
    expect(message.text).toContain('R$ 150,00');
    expect(message.html).toContain('R$ 150,00');
  });

  it('rejects malformed service order ids before billing lookup', async () => {
    await request(http)
      .post('/api/v1/billings')
      .send({ serviceOrderId: 'not-a-uuid' })
      .expect(400);

    await request(http)
      .get('/api/v1/billings?serviceOrderId=not-a-uuid')
      .expect(400);
  });

  it('registers a payment webhook once when Stripe retries it', async () => {
    const { serviceOrderId } =
      await createCompletedServiceOrderWithAcceptedBudget();
    const billing = await request(http)
      .post('/api/v1/billings')
      .send({ serviceOrderId })
      .expect(201);

    const gateway = app.get(PaymentGateway) as FakePaymentGateway;
    gateway.queueWebhookResult({
      type: 'payment_confirmed',
      gatewayTransactionId: billing.body.gatewayTransactionId,
      method: PaymentMethod.CARD,
      paidAt: new Date('2026-08-22T10:00:00.000Z'),
    });

    await request(http)
      .post('/api/v1/billings/stripe/webhook')
      .set('stripe-signature', 'fake-signature')
      .send({ id: 'evt_1' })
      .expect(204);

    gateway.queueWebhookResult({
      type: 'payment_confirmed',
      gatewayTransactionId: billing.body.gatewayTransactionId,
      method: PaymentMethod.CARD,
      paidAt: new Date('2026-08-22T10:01:00.000Z'),
    });

    await request(http)
      .post('/api/v1/billings/stripe/webhook')
      .set('stripe-signature', 'fake-signature')
      .send({ id: 'evt_1_duplicate' })
      .expect(204);

    const paid = await request(http)
      .get(`/api/v1/billings/${billing.body.id}`)
      .expect(200);

    expect(paid.body.status).toBe('PAID');
    expect(paid.body.paidAt).toBe('2026-08-22T10:00:00.000Z');
  });

  it('reconciles an original Checkout Session after payment-link renewal', async () => {
    const { serviceOrderId } =
      await createCompletedServiceOrderWithAcceptedBudget();
    const billing = await request(http)
      .post('/api/v1/billings')
      .send({ serviceOrderId })
      .expect(201);
    const originalSessionId = billing.body.gatewayTransactionId as string;

    const renewed = await app
      .get(BillingService)
      .renewPaymentLink(
        billing.body.id as string,
        new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      );

    expect(renewed.getGatewayTransactionId()).not.toBe(originalSessionId);

    const gateway = app.get(PaymentGateway) as FakePaymentGateway;
    gateway.queueWebhookResult({
      type: 'payment_confirmed',
      gatewayTransactionId: originalSessionId,
      method: PaymentMethod.CARD,
      paidAt: new Date('2026-08-22T10:00:00.000Z'),
    });

    await request(http)
      .post('/api/v1/billings/stripe/webhook')
      .set('stripe-signature', 'fake-signature')
      .send({ id: 'evt_original_session_paid' })
      .expect(204);

    const paid = await request(http)
      .get(`/api/v1/billings/${billing.body.id}`)
      .expect(200);

    expect(paid.body.status).toBe('PAID');
  });

  it('blocks billing delivery before payment and allows after payment', async () => {
    const { serviceOrderId } =
      await createCompletedServiceOrderWithAcceptedBudget();
    const billing = await request(http)
      .post('/api/v1/billings')
      .send({ serviceOrderId })
      .expect(201);

    await request(http)
      .post(`/api/v1/billings/${billing.body.id}/deliver-service-order`)
      .expect(409);

    await request(http)
      .patch(`/api/v1/service-order/${serviceOrderId}/deliver`)
      .expect(404);

    const gateway = app.get(PaymentGateway) as FakePaymentGateway;
    gateway.queueWebhookResult({
      type: 'payment_confirmed',
      gatewayTransactionId: billing.body.gatewayTransactionId,
      method: PaymentMethod.CARD,
      paidAt: new Date('2026-08-22T10:00:00.000Z'),
    });

    await request(http)
      .post('/api/v1/billings/stripe/webhook')
      .set('stripe-signature', 'fake-signature')
      .send({ id: 'evt_delivery' })
      .expect(204);

    await request(http)
      .post(`/api/v1/billings/${billing.body.id}/deliver-service-order`)
      .expect(204);

    const serviceOrder = await request(http)
      .get(`/api/v1/service-order/${serviceOrderId}`)
      .expect(200);

    expect(serviceOrder.body.status).toBe('DELIVERED');
  });
});

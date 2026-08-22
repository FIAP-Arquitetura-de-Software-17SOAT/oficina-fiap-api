import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PaymentMethod } from '../src/modules/billing/enums/payment-method.enum';
import { BillingRepository } from '../src/modules/billing/repositories/billing.repository';
import { BudgetRepository } from '../src/modules/budget/repositories/budget.repository';
import { ClientRepository } from '../src/modules/client/repositories/client.repository';
import { ServiceOrderRepository } from '../src/modules/service-order/repositories/service-order.repository';
import { VehicleRepository } from '../src/modules/vehicle/repositories/vehicle.repository';
import { PrismaService } from '../src/shared/database/prisma.service';
import { configureApp } from '../src/setup-app';
import { InMemoryBillingRepository } from './in-memory-billing.repository';
import { InMemoryBudgetRepository } from './in-memory-budget.repository';
import { InMemoryClientRepository } from './in-memory-client.repository';
import { InMemoryServiceOrderRepository } from './in-memory-service-order.repository';
import { InMemoryVehicleRepository } from './in-memory-vehicle.repository';

describe('Billing (integracao)', () => {
  let app: INestApplication<App>;
  let http: App;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
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
      .patch(`/api/v1/service-order/${serviceOrder.body.id}/start-diagnosis`)
      .send()
      .expect(200);
    await request(http)
      .patch(`/api/v1/service-order/${serviceOrder.body.id}/await-approval`)
      .send()
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

    await createAndAcceptBudget('Servico inicial', 100);
    const latestBudget = await createAndAcceptBudget('Servico atualizado', 150);
    await request(http)
      .patch(`/api/v1/service-order/${serviceOrder.body.id}/start-progress`)
      .send()
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
      status: 'OPEN',
      totalAmount: 150,
      paidAmount: 0,
      balanceAmount: 150,
      payments: [],
    });

    const persistedBudget = await request(http)
      .get(`/api/v1/budgets/${latestBudget.id}`)
      .expect(200);

    expect(persistedBudget.body).toMatchObject({
      id: latestBudget.id,
      version: 2,
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

  it('registers partial and final payments', async () => {
    const { serviceOrderId } =
      await createCompletedServiceOrderWithAcceptedBudget();
    const billing = await request(http)
      .post('/api/v1/billings')
      .send({ serviceOrderId })
      .expect(201);

    const partial = await request(http)
      .post(`/api/v1/billings/${billing.body.id}/payments`)
      .send({ amount: 50, method: PaymentMethod.PIX })
      .expect(201);

    expect(partial.body.status).toBe('PARTIALLY_PAID');
    expect(partial.body.balanceAmount).toBe(100);

    const persistedPartial = await request(http)
      .get(`/api/v1/billings/${billing.body.id}`)
      .expect(200);

    expect(persistedPartial.body).toMatchObject({
      status: 'PARTIALLY_PAID',
      paidAmount: 50,
      balanceAmount: 100,
    });
    expect(persistedPartial.body.payments).toHaveLength(1);

    const paid = await request(http)
      .post(`/api/v1/billings/${billing.body.id}/payments`)
      .send({ amount: 100, method: PaymentMethod.CREDIT_CARD })
      .expect(201);

    expect(paid.body.status).toBe('PAID');
    expect(paid.body.balanceAmount).toBe(0);
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
      .post(`/api/v1/billings/${billing.body.id}/payments`)
      .send({ amount: 150, method: PaymentMethod.CASH })
      .expect(201);

    await request(http)
      .post(`/api/v1/billings/${billing.body.id}/deliver-service-order`)
      .expect(204);

    const serviceOrder = await request(http)
      .get(`/api/v1/service-order/${serviceOrderId}`)
      .expect(200);

    expect(serviceOrder.body.status).toBe('DELIVERED');
  });
});

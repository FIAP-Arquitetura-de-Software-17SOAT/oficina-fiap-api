import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { BudgetRepository } from '../src/modules/budget/repositories/budget.repository';
import { NotificationType } from '../src/modules/notification/enums/notification-type.enum';
import { NotificationService } from '../src/modules/notification/services/notification.service';
import { ClientRepository } from '../src/modules/client/repositories/client.repository';
import { PurchaseOrderRepository } from '../src/modules/purchase-order/repositories/purchase-order.repository';
import { ServiceOrderRepository } from '../src/modules/service-order/repositories/service-order.repository';
import { PartRepository } from '../src/modules/stock/repositories/part.repository';
import { StockMovementRepository } from '../src/modules/stock/repositories/stock-movement.repository';
import { VehicleRepository } from '../src/modules/vehicle/repositories/vehicle.repository';
import { PrismaService } from '../src/shared/database/prisma.service';
import { configureApp } from '../src/setup-app';
import { InMemoryBudgetRepository } from './in-memory-budget.repository';
import { InMemoryClientRepository } from './in-memory-client.repository';
import { InMemoryPartRepository } from './in-memory-part.repository';
import { InMemoryPurchaseOrderRepository } from './in-memory-purchase-order.repository';
import { InMemoryServiceOrderRepository } from './in-memory-service-order.repository';
import { InMemoryStockMovementRepository } from './in-memory-stock-movement.repository';
import { InMemoryVehicleRepository } from './in-memory-vehicle.repository';
import { allowAuthenticated } from './allow-authenticated';

/**
 * Percorre as políticas do Event Storming que ligam os agregados:
 *
 *   orçamento aceito -> peças solicitadas -> OS aguardando peças
 *   estoque consultado com saldo -> baixa -> OS em execução
 *   estoque sem saldo -> necessidade de compra -> pedido entregue -> reposição
 *   orçamento recusado -> OS encerrada
 */
describe('Fluxo da oficina (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;
  const jwt = new JwtService();
  let notifications: { enqueue: jest.Mock };
  let config: { get: jest.Mock };

  let token: string;

  beforeEach(async () => {
    const parts = new InMemoryPartRepository();
    notifications = { enqueue: jest.fn() };
    config = {
      get: jest.fn(
        (key: string) =>
          ({
            JWT_ACCESS_SECRET: 'e2e-access-secret',
            JWT_ACCESS_TTL: '15m',
            JWT_REFRESH_SECRET: 'e2e-refresh-secret',
            JWT_REFRESH_TTL: '7d',
            STOCK_NOTIFICATION_EMAIL: 'estoque@example.com',
          })[key],
      ),
    };

    const moduleFixture: TestingModule = await allowAuthenticated(
      Test.createTestingModule({
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
        .overrideProvider(PartRepository)
        .useValue(parts)
        .overrideProvider(StockMovementRepository)
        .useValue(new InMemoryStockMovementRepository(parts))
        .overrideProvider(PurchaseOrderRepository)
        .useValue(new InMemoryPurchaseOrderRepository())
        .overrideProvider(NotificationService)
        .useValue(notifications)
        .overrideProvider(ConfigService)
        .useValue(config),
    ).compile();

    app = configureApp(
      moduleFixture.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
    http = app.getHttpServer();

    token = await jwt.signAsync(
      { sub: 'flow-user', role: 'ADMIN', type: 'access', jti: 'flow-jti' },
      { secret: 'e2e-access-secret', expiresIn: '15m' },
    );
  });

  afterEach(async () => {
    await app.close();
  });

  const createPart = async (quantity: number): Promise<string> => {
    const part = await request(http)
      .post('/api/v1/stock')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'OIL-FILTER-123',
        name: 'Filtro de óleo',
        type: 'PART',
        unit: 'UNIT',
        unitPrice: 149.9,
        minimumQuantity: 1,
      })
      .expect(201);

    const partId = part.body.id as string;

    if (quantity > 0) {
      await request(http)
        .post(`/api/v1/stock/${partId}/stock/in`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity, idempotencyKey: `seed-${partId}` })
        .expect(201);
    }

    return partId;
  };

  const openServiceOrderAwaitingApproval = async (): Promise<string> => {
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
        brand: 'Fiat',
        model: 'Argo',
        year: 2022,
      })
      .expect(201);

    const serviceOrder = await request(http)
      .post('/api/v1/service-order')
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
      .patch(`/api/v1/service-order/${id}/assign`)
      .send({ mechanicId: 'cccccccc-1c2e-4f5a-8b9c-0d1e2f3a4b5c' })
      .expect(200);

    return id;
  };

  const acceptBudgetWithPart = async (
    serviceOrderId: string,
    partId: string,
    quantity: number,
  ): Promise<string> => {
    const budget = await request(http)
      .post('/api/v1/budgets')
      .send({
        serviceOrderId,
        items: [
          {
            partId,
            description: 'Filtro de óleo',
            type: 'PART',
            quantity,
            unitPrice: 149.9,
          },
        ],
      })
      .expect(201);

    const budgetId = budget.body.id as string;

    await request(http).post(`/api/v1/budgets/${budgetId}/send`).expect(200);
    await request(http).post(`/api/v1/budgets/${budgetId}/accept`).expect(200);

    return budgetId;
  };

  const status = async (serviceOrderId: string): Promise<string> => {
    const response = await request(http)
      .get(`/api/v1/service-order/${serviceOrderId}`)
      .expect(200);

    return response.body.status as string;
  };

  const dispatch = (serviceOrderId: string) =>
    request(http)
      .post(`/api/v1/stock/service-orders/${serviceOrderId}/dispatch`)
      .set('Authorization', `Bearer ${token}`);

  it('com saldo: aceite solicita peças, a baixa move a OS para execução', async () => {
    const partId = await createPart(5);
    const serviceOrderId = await openServiceOrderAwaitingApproval();

    await acceptBudgetWithPart(serviceOrderId, partId, 2);

    expect(await status(serviceOrderId)).toBe('AWAITING_PARTS');

    await dispatch(serviceOrderId)
      .expect(200)
      .expect(({ body }) => {
        expect(body.dispatched).toBe(true);
        expect(body.purchaseOrderId).toBeNull();
      });

    expect(await status(serviceOrderId)).toBe('IN_PROGRESS');

    await request(http)
      .get(`/api/v1/stock/${partId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.quantity).toBe(3);
      });

    // Fluxo completo até a entrega, com o timer fechando o ciclo.
    await request(http)
      .patch(`/api/v1/service-order/${serviceOrderId}/complete`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('COMPLETED');
        expect(body.partsDispatchedAt).not.toBeNull();
        expect(body.executionTimeMs).toBeGreaterThanOrEqual(0);
      });

    await request(http)
      .patch(`/api/v1/service-order/${serviceOrderId}/deliver`)
      .expect(404);

    await request(http)
      .get('/api/v1/service-order/metrics/average-execution-time')
      .expect(200)
      .expect(({ body }) => {
        expect(body.sampleSize).toBe(1);
        expect(body.averageExecutionTimeMs).toBeGreaterThanOrEqual(0);
      });
  });

  it('o aceite enfileira somente as peças para o e-mail de estoque', async () => {
    const partId = await createPart(1);
    const serviceOrderId = await openServiceOrderAwaitingApproval();
    const budget = await request(http)
      .post('/api/v1/budgets')
      .send({
        serviceOrderId,
        items: [
          {
            partId,
            description: 'Filtro de óleo',
            type: 'PART',
            quantity: 2,
            unitPrice: 149.9,
          },
          {
            description: 'Troca do filtro',
            type: 'SERVICE',
            quantity: 1,
            unitPrice: 100,
          },
        ],
      })
      .expect(201);

    await request(http)
      .post(`/api/v1/budgets/${budget.body.id}/send`)
      .expect(200);
    notifications.enqueue.mockClear();

    await request(http)
      .post(`/api/v1/budgets/${budget.body.id}/accept`)
      .expect(200);

    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.STOCK_PARTS_REQUESTED,
        to: 'estoque@example.com',
        text: expect.stringContaining('Filtro de óleo'),
      }),
    );
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.not.stringContaining('Troca do filtro'),
      }),
    );
  });

  it('o atalho não existe mais: nenhuma OS chega em execução por fora do estoque', async () => {
    const serviceOrderId = await openServiceOrderAwaitingApproval();

    // As três rotas que deixavam pular o fluxo foram despublicadas.
    await request(http)
      .patch(`/api/v1/service-order/${serviceOrderId}/start-diagnosis`)
      .expect(404);
    await request(http)
      .patch(`/api/v1/service-order/${serviceOrderId}/await-parts`)
      .expect(404);
    await request(http)
      .patch(`/api/v1/service-order/${serviceOrderId}/start-progress`)
      .expect(404);

    // E finalizar sem passar por execução continua sendo transição inválida.
    await request(http)
      .patch(`/api/v1/service-order/${serviceOrderId}/complete`)
      .expect(400);

    expect(await status(serviceOrderId)).toBe('IN_DIAGNOSIS');
  });

  it('sem saldo: abre pedido de compra, e a entrega repõe o estoque e libera a baixa', async () => {
    const partId = await createPart(1);
    const serviceOrderId = await openServiceOrderAwaitingApproval();

    await acceptBudgetWithPart(serviceOrderId, partId, 3);

    let purchaseOrderId = '';

    await dispatch(serviceOrderId)
      .expect(200)
      .expect(({ body }) => {
        expect(body.dispatched).toBe(false);
        expect(body.requirements).toEqual([
          expect.objectContaining({ partId, required: 3, available: 1 }),
        ]);
        purchaseOrderId = body.purchaseOrderId as string;
      });

    // Nada foi baixado e a OS continua esperando peça.
    expect(await status(serviceOrderId)).toBe('AWAITING_PARTS');

    await request(http)
      .get(`/api/v1/purchase-orders/${purchaseOrderId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('NEEDS_PURCHASE');
        expect(body.items).toHaveLength(1);
        expect(body.items[0].quantity).toBe(2);
      });

    await request(http)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/register-purchase`)
      .expect(200);

    // Política: pedido entregue soma a quantidade recebida ao estoque.
    await request(http)
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}/deliver`)
      .expect(200);

    await request(http)
      .get(`/api/v1/stock/${partId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.quantity).toBe(3);
      });

    // Com o estoque reposto o fluxo volta para a baixa e a OS segue.
    await dispatch(serviceOrderId)
      .expect(200)
      .expect(({ body }) => {
        expect(body.dispatched).toBe(true);
      });

    expect(await status(serviceOrderId)).toBe('IN_PROGRESS');
  });

  it('orçamento recusado encerra a ordem de serviço', async () => {
    const partId = await createPart(5);
    const serviceOrderId = await openServiceOrderAwaitingApproval();

    const budget = await request(http)
      .post('/api/v1/budgets')
      .send({
        serviceOrderId,
        items: [
          {
            partId,
            description: 'Filtro de óleo',
            type: 'PART',
            quantity: 1,
            unitPrice: 149.9,
          },
        ],
      })
      .expect(201);

    await request(http)
      .post(`/api/v1/budgets/${budget.body.id}/send`)
      .expect(200);

    await request(http)
      .post(`/api/v1/budgets/${budget.body.id}/refuse`)
      .send({ reason: 'Achou caro' })
      .expect(200);

    await request(http)
      .get(`/api/v1/service-order/${serviceOrderId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('CANCELLED');
        expect(body.cancellationReason).toContain('Achou caro');
      });
  });

  it('recusa despachar peças de OS sem orçamento aceito', async () => {
    const serviceOrderId = await openServiceOrderAwaitingApproval();

    await dispatch(serviceOrderId).expect(400);
  });
});

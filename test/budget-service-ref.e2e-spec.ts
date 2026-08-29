import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { BudgetRepository } from '../src/modules/budget/repositories/budget.repository';
import { ClientRepository } from '../src/modules/client/repositories/client.repository';
import { NotificationService } from '../src/modules/notification/services/notification.service';
import { ServiceRepository } from '../src/modules/service-catalog/repositories/service.repository';
import { ServiceOrderRepository } from '../src/modules/service-order/repositories/service-order.repository';
import { VehicleRepository } from '../src/modules/vehicle/repositories/vehicle.repository';
import { PrismaService } from '../src/shared/database/prisma.service';
import { configureApp } from '../src/setup-app';
import { InMemoryBudgetRepository } from './in-memory-budget.repository';
import { InMemoryClientRepository } from './in-memory-client.repository';
import { InMemoryServiceRepository } from './in-memory-service.repository';
import { InMemoryServiceOrderRepository } from './in-memory-service-order.repository';
import { InMemoryVehicleRepository } from './in-memory-vehicle.repository';
import { allowAuthenticated } from './allow-authenticated';

const MISSING_UUID = '2f1b7d3e-9a4c-4e5b-8f6a-1c2d3e4f5a6b';

/**
 * O item de orçamento referencia o serviço do catálogo por identidade e guarda
 * descrição e preço como cópia. Estes testes protegem as duas metades: o
 * vínculo tem que existir de verdade, e o preço cobrado não pode passar a
 * seguir o catálogo.
 */
describe('Orçamento x catálogo de serviços (integração)', () => {
  let app: INestApplication<App>;
  let http: App;
  let serviceOrderId: string;
  let catalogServiceId: string;

  beforeEach(async () => {
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
        .overrideProvider(ServiceRepository)
        .useValue(new InMemoryServiceRepository())
        .overrideProvider(NotificationService)
        .useValue({ enqueue: jest.fn() }),
    ).compile();

    app = configureApp(
      moduleFixture.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
    http = app.getHttpServer();

    serviceOrderId = await openServiceOrderInDiagnosis();
    catalogServiceId = await createCatalogService();
  });

  afterEach(async () => {
    await app.close();
  });

  const openServiceOrderInDiagnosis = async (): Promise<string> => {
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

    await request(http)
      .patch(`/api/v1/service-orders/${serviceOrder.body.id}/assign`)
      .send({ mechanicId: 'cccccccc-1c2e-4f5a-8b9c-0d1e2f3a4b5c' })
      .expect(200);

    return serviceOrder.body.id as string;
  };

  const createCatalogService = async (): Promise<string> => {
    const response = await request(http)
      .post('/api/v1/services')
      .send({ name: 'Troca de óleo', price: 120 })
      .expect(201);

    return response.body.id as string;
  };

  const createBudgetWith = (item: Record<string, unknown>) =>
    request(http)
      .post('/api/v1/budgets')
      .send({ serviceOrderId, items: [item] });

  it('vincula o item de serviço ao serviço do catálogo', async () => {
    const response = await createBudgetWith({
      serviceId: catalogServiceId,
      description: 'Troca de óleo',
      type: 'SERVICE',
      quantity: 1,
      unitPrice: 120,
    }).expect(201);

    expect(response.body.items[0]).toMatchObject({
      serviceId: catalogServiceId,
      type: 'SERVICE',
      unitPrice: 120,
    });
  });

  it('mantém serviceId nulo quando o item não referencia o catálogo', async () => {
    const response = await createBudgetWith({
      description: 'Serviço avulso',
      type: 'SERVICE',
      quantity: 1,
      unitPrice: 90,
    }).expect(201);

    expect(response.body.items[0].serviceId).toBeNull();
  });

  it('404 quando o serviço referenciado não existe no catálogo', async () => {
    await createBudgetWith({
      serviceId: MISSING_UUID,
      description: 'Troca de óleo',
      type: 'SERVICE',
      quantity: 1,
      unitPrice: 120,
    }).expect(404);
  });

  it('400 quando um item de peça tenta referenciar serviço', async () => {
    await createBudgetWith({
      serviceId: catalogServiceId,
      description: 'Filtro de óleo',
      type: 'PART',
      quantity: 1,
      unitPrice: 40,
    }).expect(400);
  });

  it('400 quando o serviceId não é uuid', async () => {
    await createBudgetWith({
      serviceId: 'nao-e-uuid',
      description: 'Troca de óleo',
      type: 'SERVICE',
      quantity: 1,
      unitPrice: 120,
    }).expect(400);
  });

  it('mantém o preço acordado quando o catálogo é reajustado depois', async () => {
    const budget = await createBudgetWith({
      serviceId: catalogServiceId,
      description: 'Troca de óleo',
      type: 'SERVICE',
      quantity: 1,
      unitPrice: 120,
    }).expect(201);

    await request(http)
      .patch(`/api/v1/services/${catalogServiceId}`)
      .send({ price: 250 })
      .expect(200);

    const reloaded = await request(http)
      .get(`/api/v1/budgets/${budget.body.id}`)
      .expect(200);

    expect(reloaded.body.items[0].unitPrice).toBe(120);
    expect(reloaded.body.totalAmount).toBe(120);
  });

  it('valida o catálogo também ao adicionar item depois', async () => {
    const budget = await createBudgetWith({
      description: 'Serviço avulso',
      type: 'SERVICE',
      quantity: 1,
      unitPrice: 90,
    }).expect(201);

    await request(http)
      .post(`/api/v1/budgets/${budget.body.id}/items`)
      .send({
        serviceId: MISSING_UUID,
        description: 'Alinhamento',
        type: 'SERVICE',
        quantity: 1,
        unitPrice: 80,
      })
      .expect(404);

    const added = await request(http)
      .post(`/api/v1/budgets/${budget.body.id}/items`)
      .send({
        serviceId: catalogServiceId,
        description: 'Troca de óleo',
        type: 'SERVICE',
        quantity: 1,
        unitPrice: 120,
      })
      .expect(201);

    expect(added.body.items).toHaveLength(2);
    expect(added.body.items[1].serviceId).toBe(catalogServiceId);
  });
});

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { ClientRepository } from '../src/modules/client/repositories/client.repository';
import { ServiceOrderRepository } from '../src/modules/service-order/repositories/service-order.repository';
import { PrismaService } from '../src/shared/database/prisma.service';
import { configureApp } from '../src/setup-app';
import { InMemoryClientRepository } from './in-memory-client.repository';
import { InMemoryVehicleRepository } from './in-memory-vehicle.repository';
import { VehicleRepository } from '../src/modules/vehicle/repositories/vehicle.repository';
import { InMemoryServiceOrderRepository } from './in-memory-service-order.repository';
import { allowAuthenticated } from './allow-authenticated';

const clientPayload = {
  name: 'Maria Silva',
  document: '529.982.247-25',
  email: 'maria@example.com',
  phone: '(11) 99999-8888',
};

const openPayload = (clientId: string, vehicleId: string) => ({
  clientId,
  vehicleId,
  description: 'Barulho no motor ao acelerar',
});

describe('ServiceOrder (integração)', () => {
  let app: INestApplication<App>;
  let http: App;

  beforeEach(async () => {
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
        .useValue(new InMemoryServiceOrderRepository()),
    ).compile();

    app = configureApp(
      moduleFixture.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
    http = app.getHttpServer();
  });

  afterEach(async () => {
    await app.close();
  });

  // A OS exige um veículo existente e do próprio cliente, então o cenário
  // mínimo agora é cliente + veículo.
  const createClientWithVehicle = async (): Promise<{
    clientId: string;
    vehicleId: string;
  }> => {
    const client = await request(http)
      .post('/api/v1/client')
      .send(clientPayload)
      .expect(201);
    const clientId = client.body.id as string;

    const vehicle = await request(http)
      .post('/api/v1/vehicle')
      .send({
        clientId,
        plate: 'ABC1D23',
        brand: 'Fiat',
        model: 'Argo',
        year: 2022,
      })
      .expect(201);

    return { clientId, vehicleId: vehicle.body.id as string };
  };

  const open = (body: Record<string, unknown>) =>
    request(http).post('/api/v1/service-order').send(body);

  const advance = (
    id: string,
    action: string,
    body: Record<string, unknown> = {},
  ) => request(http).patch(`/api/v1/service-order/${id}/${action}`).send(body);

  describe('POST /api/v1/service-order', () => {
    it('abre a OS com status RECEIVED', async () => {
      const { clientId, vehicleId } = await createClientWithVehicle();

      const response = await open(openPayload(clientId, vehicleId)).expect(201);

      expect(response.body).toMatchObject({
        clientId,
        status: 'RECEIVED',
        cancellationReason: null,
      });
      expect(response.body).toHaveProperty('id');
    });

    it('devolve 404 quando o cliente não existe', async () => {
      await open(
        openPayload(
          'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
          'a1b2c3d4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        ),
      ).expect(404);
    });

    it('devolve 400 quando a descrição está vazia', async () => {
      const { clientId, vehicleId } = await createClientWithVehicle();

      await open({
        ...openPayload(clientId, vehicleId),
        description: '',
      }).expect(400);
    });

    it('devolve 400 para campo desconhecido no corpo', async () => {
      const { clientId, vehicleId } = await createClientWithVehicle();

      await open({ ...openPayload(clientId, vehicleId), admin: true }).expect(
        400,
      );
    });
  });

  describe('GET /api/v1/service-order', () => {
    it('lista vazia quando não há OS', async () => {
      const response = await request(http)
        .get('/api/v1/service-order')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('lista as OS abertas', async () => {
      const { clientId, vehicleId } = await createClientWithVehicle();
      await open(openPayload(clientId, vehicleId)).expect(201);

      const response = await request(http)
        .get('/api/v1/service-order')
        .expect(200);

      expect(response.body).toHaveLength(1);
    });
  });

  describe('GET /api/v1/service-order/metrics/average-execution-time', () => {
    it('devolve null e amostra 0 sem OS finalizada', async () => {
      const response = await request(http)
        .get('/api/v1/service-order/metrics/average-execution-time')
        .expect(200);

      expect(response.body).toEqual({
        averageExecutionTimeMs: null,
        sampleSize: 0,
      });
    });

    it('OS sem atribuição não tem como chegar em execução', async () => {
      const { clientId, vehicleId } = await createClientWithVehicle();
      const { body: created } = await open(
        openPayload(clientId, vehicleId),
      ).expect(201);

      // Não existe mais rota que mova a OS para IN_PROGRESS: quem faz isso é o
      // estoque, depois de atender as peças. O atalho sumiu.
      await advance(created.id, 'start-diagnosis').expect(404);
      await advance(created.id, 'start-progress').expect(404);
      await advance(created.id, 'await-parts').expect(404);
      await advance(created.id, 'await-approval').expect(404);

      const response = await request(http)
        .get('/api/v1/service-order/metrics/average-execution-time')
        .expect(200);

      expect(response.body).toEqual({
        averageExecutionTimeMs: null,
        sampleSize: 0,
      });
    });
  });

  describe('GET /api/v1/service-order/:id', () => {
    it('busca por id', async () => {
      const { clientId, vehicleId } = await createClientWithVehicle();
      const { body: created } = await open(
        openPayload(clientId, vehicleId),
      ).expect(201);

      const response = await request(http)
        .get(`/api/v1/service-order/${created.id}`)
        .expect(200);

      expect(response.body.id).toBe(created.id);
    });

    it('devolve 404 para id inexistente', async () => {
      await request(http)
        .get('/api/v1/service-order/f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c')
        .expect(404);
    });

    it('devolve 400 para id que não é uuid', async () => {
      await request(http).get('/api/v1/service-order/nao-e-uuid').expect(400);
    });
  });

  describe('fluxo de transição de status', () => {
    // O fluxo até DELIVERED passa por orçamento e estoque, então mora em
    // workshop-flow.e2e-spec.ts. Aqui fica o que é só da ordem de serviço.
    it('atribuir leva a OS até o diagnóstico, e daí quem move são as políticas', async () => {
      const { clientId, vehicleId } = await createClientWithVehicle();
      const { body: created } = await open(
        openPayload(clientId, vehicleId),
      ).expect(201);

      const response = await advance(created.id, 'assign', {
        mechanicId: 'cccccccc-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      }).expect(200);

      expect(response.body.status).toBe('IN_DIAGNOSIS');
      // Gerar o orçamento é que leva para AWAITING_APPROVAL; não há rota manual.
      await advance(created.id, 'await-approval').expect(404);
    });

    it('devolve 400 ao entregar OS que ainda não foi finalizada', async () => {
      const { clientId, vehicleId } = await createClientWithVehicle();
      const { body: created } = await open(
        openPayload(clientId, vehicleId),
      ).expect(201);

      await advance(created.id, 'deliver').expect(400);
    });

    it('cancelar é possível a qualquer momento antes da finalização', async () => {
      const { clientId, vehicleId } = await createClientWithVehicle();
      const { body: created } = await open(
        openPayload(clientId, vehicleId),
      ).expect(201);

      await advance(created.id, 'assign', {
        mechanicId: 'cccccccc-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      }).expect(200);
      const response = await advance(created.id, 'cancel', {
        reason: 'Cliente desistiu',
      }).expect(200);

      expect(response.body.status).toBe('CANCELLED');
    });

    it('devolve 400 ao pular etapa da transição', async () => {
      const { clientId, vehicleId } = await createClientWithVehicle();
      const { body: created } = await open(
        openPayload(clientId, vehicleId),
      ).expect(201);

      await advance(created.id, 'complete').expect(400);
    });

    it('cancela com motivo', async () => {
      const { clientId, vehicleId } = await createClientWithVehicle();
      const { body: created } = await open(
        openPayload(clientId, vehicleId),
      ).expect(201);

      const response = await advance(created.id, 'cancel', {
        reason: 'Cliente desistiu',
      }).expect(200);

      expect(response.body.status).toBe('CANCELLED');
      expect(response.body.cancellationReason).toBe('Cliente desistiu');
    });

    it('devolve 400 ao cancelar sem motivo', async () => {
      const { clientId, vehicleId } = await createClientWithVehicle();
      const { body: created } = await open(
        openPayload(clientId, vehicleId),
      ).expect(201);

      await advance(created.id, 'cancel', {}).expect(400);
    });

    it('devolve 404 ao avançar OS inexistente', async () => {
      await advance('f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c', 'assign', {
        mechanicId: 'cccccccc-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      }).expect(404);
    });
  });
  describe('atribuição ao mecânico', () => {
    const MECHANIC = 'cccccccc-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

    it('atribuir move a OS para IN_DIAGNOSIS e inicia o timer', async () => {
      const { clientId, vehicleId } = await createClientWithVehicle();
      const { body: created } = await open(
        openPayload(clientId, vehicleId),
      ).expect(201);

      expect(created.assignedAt).toBeNull();

      await advance(created.id, 'assign', { mechanicId: MECHANIC })
        .expect(200)
        .expect(({ body }) => {
          expect(body.status).toBe('IN_DIAGNOSIS');
          expect(body.mechanicId).toBe(MECHANIC);
          expect(body.assignedAt).not.toBeNull();
        });
    });

    it('mecânico não assume outra OS antes de finalizar a atual', async () => {
      const { clientId, vehicleId } = await createClientWithVehicle();
      const { body: primeira } = await open(
        openPayload(clientId, vehicleId),
      ).expect(201);
      const { body: segunda } = await open(
        openPayload(clientId, vehicleId),
      ).expect(201);

      await advance(primeira.id, 'assign', { mechanicId: MECHANIC }).expect(
        200,
      );

      await advance(segunda.id, 'assign', { mechanicId: MECHANIC }).expect(409);

      // Encerrada a primeira, o mecânico fica livre para a próxima.
      await advance(primeira.id, 'cancel', {
        reason: 'Cliente desistiu',
      }).expect(200);

      await advance(segunda.id, 'assign', { mechanicId: MECHANIC }).expect(200);
    });

    it('recusa reatribuir uma OS que já tem mecânico', async () => {
      const { clientId, vehicleId } = await createClientWithVehicle();
      const { body: created } = await open(
        openPayload(clientId, vehicleId),
      ).expect(201);

      await advance(created.id, 'assign', { mechanicId: MECHANIC }).expect(200);
      await advance(created.id, 'assign', {
        mechanicId: 'dddddddd-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      }).expect(400);
    });
  });

  describe('GET /api/v1/service-order/client/:clientId', () => {
    it('cliente acompanha o status das próprias OS', async () => {
      const { clientId, vehicleId } = await createClientWithVehicle();
      const { body: created } = await open(
        openPayload(clientId, vehicleId),
      ).expect(201);

      await advance(created.id, 'assign', {
        mechanicId: 'cccccccc-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
      }).expect(200);

      await request(http)
        .get(`/api/v1/service-order/client/${clientId}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toHaveLength(1);
          expect(body[0].id).toBe(created.id);
          expect(body[0].status).toBe('IN_DIAGNOSIS');
        });
    });

    it('cliente sem OS recebe lista vazia', async () => {
      const { clientId } = await createClientWithVehicle();

      await request(http)
        .get(`/api/v1/service-order/client/${clientId}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toEqual([]);
        });
    });

    it('404 para cliente inexistente', async () => {
      await request(http)
        .get(
          '/api/v1/service-order/client/eeeeeeee-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        )
        .expect(404);
    });
  });
});

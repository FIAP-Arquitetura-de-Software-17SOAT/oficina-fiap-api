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
import { InMemoryServiceOrderRepository } from './in-memory-service-order.repository';

const clientPayload = {
  name: 'Maria Silva',
  document: '529.982.247-25',
  email: 'maria@example.com',
  phone: '(11) 99999-8888',
};

const openPayload = (clientId: string) => ({
  clientId,
  vehicleId: 'a1b2c3d4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
  description: 'Barulho no motor ao acelerar',
});

describe('ServiceOrder (integração)', () => {
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
      .overrideProvider(ServiceOrderRepository)
      .useValue(new InMemoryServiceOrderRepository())
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

  const createClient = async (): Promise<string> => {
    const response = await request(http)
      .post('/api/v1/client')
      .send(clientPayload)
      .expect(201);

    return response.body.id as string;
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
      const clientId = await createClient();

      const response = await open(openPayload(clientId)).expect(201);

      expect(response.body).toMatchObject({
        clientId,
        status: 'RECEIVED',
        cancellationReason: null,
      });
      expect(response.body).toHaveProperty('id');
    });

    it('devolve 404 quando o cliente não existe', async () => {
      await open(openPayload('f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c')).expect(
        404,
      );
    });

    it('devolve 400 quando a descrição está vazia', async () => {
      const clientId = await createClient();

      await open({ ...openPayload(clientId), description: '' }).expect(400);
    });

    it('devolve 400 para campo desconhecido no corpo', async () => {
      const clientId = await createClient();

      await open({ ...openPayload(clientId), admin: true }).expect(400);
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
      const clientId = await createClient();
      await open(openPayload(clientId)).expect(201);

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

    it('calcula a média após finalizar uma OS', async () => {
      const clientId = await createClient();
      const { body: created } = await open(openPayload(clientId)).expect(201);

      await advance(created.id, 'start-diagnosis').expect(200);
      await advance(created.id, 'await-approval').expect(200);
      await advance(created.id, 'start-progress').expect(200);
      await advance(created.id, 'complete').expect(200);

      const response = await request(http)
        .get('/api/v1/service-order/metrics/average-execution-time')
        .expect(200);

      expect(response.body.sampleSize).toBe(1);
      expect(response.body.averageExecutionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /api/v1/service-order/:id', () => {
    it('busca por id', async () => {
      const clientId = await createClient();
      const { body: created } = await open(openPayload(clientId)).expect(201);

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
    it('percorre o fluxo feliz até COMPLETED', async () => {
      const clientId = await createClient();
      const { body: created } = await open(openPayload(clientId)).expect(201);

      await advance(created.id, 'start-diagnosis').expect(200);
      await advance(created.id, 'await-approval').expect(200);
      await advance(created.id, 'start-progress').expect(200);
      await advance(created.id, 'complete').expect(200);
      const response = await request(http)
        .get(`/api/v1/service-order/${created.id}`)
        .expect(200);

      expect(response.body.status).toBe('COMPLETED');
    });

    it('does not expose the legacy delivery path for an unpaid completed service order', async () => {
      const clientId = await createClient();
      const { body: created } = await open(openPayload(clientId)).expect(201);

      await advance(created.id, 'start-diagnosis').expect(200);
      await advance(created.id, 'await-approval').expect(200);
      await advance(created.id, 'start-progress').expect(200);
      await advance(created.id, 'complete').expect(200);

      await advance(created.id, 'deliver').expect(404);

      const response = await request(http)
        .get(`/api/v1/service-order/${created.id}`)
        .expect(200);
      expect(response.body.status).toBe('COMPLETED');
    });

    it('percorre o fluxo com peças até COMPLETED', async () => {
      const clientId = await createClient();
      const { body: created } = await open(openPayload(clientId)).expect(201);

      await advance(created.id, 'start-diagnosis').expect(200);
      await advance(created.id, 'await-approval').expect(200);
      await advance(created.id, 'await-parts').expect(200);
      const response = await advance(created.id, 'start-progress').expect(200);

      expect(response.body.status).toBe('IN_PROGRESS');
    });

    it('devolve 400 ao pular etapa da transição', async () => {
      const clientId = await createClient();
      const { body: created } = await open(openPayload(clientId)).expect(201);

      await advance(created.id, 'complete').expect(400);
    });

    it('cancela com motivo', async () => {
      const clientId = await createClient();
      const { body: created } = await open(openPayload(clientId)).expect(201);

      const response = await advance(created.id, 'cancel', {
        reason: 'Cliente desistiu',
      }).expect(200);

      expect(response.body.status).toBe('CANCELLED');
      expect(response.body.cancellationReason).toBe('Cliente desistiu');
    });

    it('devolve 400 ao cancelar sem motivo', async () => {
      const clientId = await createClient();
      const { body: created } = await open(openPayload(clientId)).expect(201);

      await advance(created.id, 'cancel', {}).expect(400);
    });

    it('devolve 404 ao avançar OS inexistente', async () => {
      await advance(
        'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
        'start-diagnosis',
      ).expect(404);
    });
  });
});

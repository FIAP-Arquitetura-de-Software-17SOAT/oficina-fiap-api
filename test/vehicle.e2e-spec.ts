import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { ClientRepository } from '../src/modules/client/repositories/client.repository';
import { VehicleRepository } from '../src/modules/vehicle/repositories/vehicle.repository';
import { PrismaService } from '../src/shared/database/prisma.service';
import { configureApp } from '../src/setup-app';
import { InMemoryClientRepository } from './in-memory-client.repository';
import { InMemoryVehicleRepository } from './in-memory-vehicle.repository';
import { allowAuthenticated } from './allow-authenticated';

const UUID_INEXISTENTE = 'f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c';

const clientPayload = {
  name: 'Maria Silva',
  document: '529.982.247-25',
  email: 'maria@example.com',
  phone: '11999998888',
};

describe('Vehicle (integração)', () => {
  let app: INestApplication<App>;
  let http: App;
  let clientId: string;

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
        .useValue(new InMemoryVehicleRepository()),
    ).compile();

    app = configureApp(
      moduleFixture.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
    http = app.getHttpServer();

    const { body } = await request(http)
      .post('/api/v1/client')
      .send(clientPayload)
      .expect(201);
    clientId = body.id;
  });

  afterEach(async () => {
    await app.close();
  });

  const payload = () => ({
    clientId,
    plate: 'abc-1d23',
    brand: '  Fiat  ',
    model: 'Argo',
    year: 2022,
  });

  const create = (body: Record<string, unknown> = payload()) =>
    request(http).post('/api/v1/vehicle').send(body);

  describe('POST /api/v1/vehicle', () => {
    it('cadastra normalizando a placa e aparando os textos', async () => {
      const response = await create().expect(201);

      expect(response.body).toMatchObject({
        clientId,
        plate: 'ABC1D23',
        brand: 'Fiat',
        model: 'Argo',
        year: 2022,
      });
      expect(response.body).toHaveProperty('id');
    });

    it('devolve plate como string, não como Value Object', async () => {
      const response = await create().expect(201);

      expect(typeof response.body.plate).toBe('string');
      expect(typeof response.body.year).toBe('number');
    });

    it('aceita placa no formato antigo', async () => {
      const response = await create({
        ...payload(),
        plate: 'ABC-1234',
      }).expect(201);

      expect(response.body.plate).toBe('ABC1234');
    });

    it('devolve 400 (e não 500) para placa inválida', async () => {
      const response = await create({ ...payload(), plate: 'ABCD123' }).expect(
        400,
      );

      expect(response.body.message).toBe('Placa inválida');
    });

    it('devolve 400 para ano fora da faixa', async () => {
      await create({ ...payload(), year: 1800 }).expect(400);
    });

    it('devolve 400 para ano que não é inteiro', async () => {
      await create({ ...payload(), year: 'abc' }).expect(400);
    });

    it('devolve 400 para campo desconhecido no corpo', async () => {
      await create({ ...payload(), cor: 'vermelho' }).expect(400);
    });

    it('devolve 404 quando o cliente não existe', async () => {
      await create({ ...payload(), clientId: UUID_INEXISTENTE }).expect(404);
    });

    it('devolve 409 para placa duplicada, mesmo com máscara diferente', async () => {
      await create().expect(201);

      await create({ ...payload(), plate: 'ABC1D23' }).expect(409);
    });
  });

  describe('GET /api/v1/vehicle', () => {
    it('lista vazia quando não há veículos', async () => {
      const response = await request(http).get('/api/v1/vehicle').expect(200);

      expect(response.body).toEqual([]);
    });

    it('filtra pelos veículos de um cliente', async () => {
      await create().expect(201);
      await create({ ...payload(), plate: 'XYZ9876' }).expect(201);

      const response = await request(http)
        .get(`/api/v1/vehicle?clientId=${clientId}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
    });

    it('devolve 404 ao filtrar por cliente inexistente', async () => {
      await request(http)
        .get(`/api/v1/vehicle?clientId=${UUID_INEXISTENTE}`)
        .expect(404);
    });

    it('devolve 400 quando o filtro não é uuid', async () => {
      await request(http).get('/api/v1/vehicle?clientId=xpto').expect(400);
    });
  });

  describe('GET /api/v1/vehicle/:id', () => {
    it('busca por id', async () => {
      const { body: created } = await create().expect(201);

      const response = await request(http)
        .get(`/api/v1/vehicle/${created.id}`)
        .expect(200);

      expect(response.body.id).toBe(created.id);
    });

    it('devolve 404 para id inexistente', async () => {
      await request(http)
        .get(`/api/v1/vehicle/${UUID_INEXISTENTE}`)
        .expect(404);
    });

    it('devolve 400 para id que não é uuid', async () => {
      await request(http).get('/api/v1/vehicle/nao-e-uuid').expect(400);
    });
  });

  describe('PATCH /api/v1/vehicle/:id', () => {
    it('atualiza apenas os campos enviados', async () => {
      const { body: created } = await create().expect(201);

      const response = await request(http)
        .patch(`/api/v1/vehicle/${created.id}`)
        .send({ brand: 'Volkswagen' })
        .expect(200);

      expect(response.body.brand).toBe('Volkswagen');
      expect(response.body.plate).toBe('ABC1D23');
      expect(response.body.model).toBe('Argo');
    });

    it.each([
      ['placa', { plate: 'XYZ9876' }],
      ['dono', { clientId: UUID_INEXISTENTE }],
    ])('recusa alteração de %s porque é imutável', async (_label, body) => {
      const { body: created } = await create().expect(201);

      await request(http)
        .patch(`/api/v1/vehicle/${created.id}`)
        .send(body)
        .expect(400);
    });

    it('devolve 404 para id inexistente', async () => {
      await request(http)
        .patch(`/api/v1/vehicle/${UUID_INEXISTENTE}`)
        .send({ brand: 'X' })
        .expect(404);
    });
  });

  describe('DELETE /api/v1/vehicle/:id', () => {
    it('remove o veículo e devolve 204', async () => {
      const { body: created } = await create().expect(201);

      await request(http).delete(`/api/v1/vehicle/${created.id}`).expect(204);

      await request(http).get(`/api/v1/vehicle/${created.id}`).expect(404);
    });

    it('devolve 404 para id inexistente', async () => {
      await request(http)
        .delete(`/api/v1/vehicle/${UUID_INEXISTENTE}`)
        .expect(404);
    });
  });
});

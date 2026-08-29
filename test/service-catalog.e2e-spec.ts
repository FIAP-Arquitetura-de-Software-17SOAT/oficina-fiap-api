import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { ServiceRepository } from '../src/modules/service-catalog/repositories/service.repository';
import { PrismaService } from '../src/shared/database/prisma.service';
import { configureApp } from '../src/setup-app';
import { InMemoryServiceRepository } from './in-memory-service.repository';
import { allowAuthenticated } from './allow-authenticated';

const payload = {
  name: '  Troca de óleo e filtro  ',
  description: '  Inclui óleo sintético 5W30.  ',
  price: 149.9,
};

describe('Catálogo de serviços (integração)', () => {
  let app: INestApplication<App>;
  let http: App;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await allowAuthenticated(
      Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(PrismaService)
        .useValue({})
        .overrideProvider(ServiceRepository)
        .useValue(new InMemoryServiceRepository()),
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

  const create = (body: Record<string, unknown> = payload) =>
    request(http).post('/api/v1/services').send(body);

  describe('POST /api/v1/services', () => {
    it('cadastra normalizando nome e descrição', async () => {
      const response = await create().expect(201);

      expect(response.body).toMatchObject({
        name: 'Troca de óleo e filtro',
        description: 'Inclui óleo sintético 5W30.',
        price: 149.9,
      });
      expect(response.body.id).toHaveLength(36);
    });

    it('aceita serviço sem descrição, devolvendo null', async () => {
      const response = await create({ name: 'Alinhamento', price: 80 }).expect(
        201,
      );

      expect(response.body.description).toBeNull();
    });

    it('recusa nome duplicado com 409', async () => {
      await create().expect(201);

      await create().expect(409);
    });

    it.each([
      ['preço zero', { name: 'A', price: 0 }],
      ['preço negativo', { name: 'B', price: -1 }],
      ['preço com três casas', { name: 'C', price: 10.999 }],
      ['nome vazio', { name: '   ', price: 10 }],
      ['sem preço', { name: 'D' }],
      ['campo desconhecido', { name: 'E', price: 10, foo: 'bar' }],
    ])('recusa %s com 400', async (_caso, body) => {
      await create(body).expect(400);
    });
  });

  describe('GET /api/v1/services', () => {
    it('lista os serviços cadastrados', async () => {
      await create().expect(201);
      await create({ name: 'Alinhamento', price: 80 }).expect(201);

      const response = await request(http).get('/api/v1/services').expect(200);

      expect(response.body).toHaveLength(2);
    });

    it('devolve lista vazia quando o catálogo está vazio', async () => {
      await request(http).get('/api/v1/services').expect(200).expect([]);
    });
  });

  describe('GET /api/v1/services/:id', () => {
    it('busca por id', async () => {
      const created = await create().expect(201);

      await request(http)
        .get(`/api/v1/services/${created.body.id}`)
        .expect(200)
        .expect(({ body }) => expect(body.id).toBe(created.body.id));
    });

    it('404 quando não existe', async () => {
      await request(http)
        .get('/api/v1/services/2f1b7d3e-9a4c-4e5b-8f6a-1c2d3e4f5a6b')
        .expect(404);
    });

    it('400 quando o id não é uuid', async () => {
      await request(http).get('/api/v1/services/abc').expect(400);
    });
  });

  describe('PATCH /api/v1/services/:id', () => {
    it('atualiza preço mantendo os demais campos', async () => {
      const created = await create().expect(201);

      const response = await request(http)
        .patch(`/api/v1/services/${created.body.id}`)
        .send({ price: 189.9 })
        .expect(200);

      expect(response.body).toMatchObject({
        name: 'Troca de óleo e filtro',
        price: 189.9,
      });
    });

    it('limpa a descrição quando recebe string vazia', async () => {
      const created = await create().expect(201);

      const response = await request(http)
        .patch(`/api/v1/services/${created.body.id}`)
        .send({ description: '' })
        .expect(200);

      expect(response.body.description).toBeNull();
    });

    it('recusa nome já usado por outro serviço com 409', async () => {
      await create({ name: 'Alinhamento', price: 80 }).expect(201);
      const created = await create().expect(201);

      await request(http)
        .patch(`/api/v1/services/${created.body.id}`)
        .send({ name: 'Alinhamento' })
        .expect(409);
    });

    it('404 quando o serviço não existe', async () => {
      await request(http)
        .patch('/api/v1/services/2f1b7d3e-9a4c-4e5b-8f6a-1c2d3e4f5a6b')
        .send({ price: 10 })
        .expect(404);
    });
  });

  describe('DELETE /api/v1/services/:id', () => {
    it('remove e some da listagem', async () => {
      const created = await create().expect(201);

      await request(http)
        .delete(`/api/v1/services/${created.body.id}`)
        .expect(204);

      await request(http).get('/api/v1/services').expect(200).expect([]);
    });

    it('404 quando o serviço não existe', async () => {
      await request(http)
        .delete('/api/v1/services/2f1b7d3e-9a4c-4e5b-8f6a-1c2d3e4f5a6b')
        .expect(404);
    });
  });
});

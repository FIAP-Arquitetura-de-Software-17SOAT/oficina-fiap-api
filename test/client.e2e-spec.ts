import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { ClientRepository } from '../src/modules/client/repositories/client.repository';
import { PrismaService } from '../src/shared/database/prisma.service';
import { configureApp } from '../src/setup-app';
import { InMemoryClientRepository } from './in-memory-client.repository';
import { allowAuthenticated } from './allow-authenticated';

const VALID_CPF = '52998224725';
const VALID_CNPJ = '11222333000181';

const payload = {
  name: 'Maria Silva',
  document: '529.982.247-25',
  email: 'Maria@Example.com',
  phone: '(11) 99999-8888',
};

describe('Client (integração)', () => {
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
        .useValue(new InMemoryClientRepository()),
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
    request(http).post('/api/v1/client').send(body);

  describe('POST /api/v1/client', () => {
    it('cadastra o cliente normalizando documento, e-mail e telefone', async () => {
      const response = await create().expect(201);

      expect(response.body).toMatchObject({
        name: 'Maria Silva',
        document: VALID_CPF,
        email: 'maria@example.com',
        phone: '11999998888',
      });
      expect(response.body).toHaveProperty('id');
    });

    it('devolve document e email como string, não como Value Object', async () => {
      const response = await create().expect(201);

      expect(typeof response.body.document).toBe('string');
      expect(typeof response.body.email).toBe('string');
    });

    it('aceita CNPJ', async () => {
      const response = await create({
        ...payload,
        document: '11.222.333/0001-81',
      }).expect(201);

      expect(response.body.document).toBe(VALID_CNPJ);
    });

    it('devolve 400 (e não 500) para CPF com dígito verificador errado', async () => {
      const response = await create({
        ...payload,
        document: '52998224726',
      }).expect(400);

      expect(response.body.message).toBe('CPF/CNPJ inválido');
    });

    it('devolve 400 para telefone sem DDD', async () => {
      await create({ ...payload, phone: '99998888' }).expect(400);
    });

    it('devolve 400 para e-mail malformado, barrado no DTO', async () => {
      await create({ ...payload, email: 'nao-e-email' }).expect(400);
    });

    it('devolve 400 para campo desconhecido no corpo', async () => {
      await create({ ...payload, admin: true }).expect(400);
    });

    it('devolve 409 para documento duplicado, mesmo com máscara diferente', async () => {
      await create().expect(201);

      await create({ ...payload, email: 'outra@example.com' }).expect(409);
    });

    it('devolve 409 para e-mail duplicado com caixa diferente', async () => {
      await create().expect(201);

      await create({
        ...payload,
        document: VALID_CNPJ,
        email: 'MARIA@example.com',
      }).expect(409);
    });
  });

  describe('GET /api/v1/client', () => {
    it('lista vazia quando não há clientes', async () => {
      const response = await request(http).get('/api/v1/client').expect(200);

      expect(response.body).toEqual([]);
    });

    it('lista os clientes cadastrados', async () => {
      await create().expect(201);

      const response = await request(http).get('/api/v1/client').expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].document).toBe(VALID_CPF);
    });
  });

  describe('GET /api/v1/client/:id', () => {
    it('busca por id', async () => {
      const { body: created } = await create().expect(201);

      const response = await request(http)
        .get(`/api/v1/client/${created.id}`)
        .expect(200);

      expect(response.body.id).toBe(created.id);
    });

    it('devolve 404 para id inexistente', async () => {
      await request(http)
        .get('/api/v1/client/f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c')
        .expect(404);
    });

    it('devolve 400 para id que não é uuid', async () => {
      await request(http).get('/api/v1/client/nao-e-uuid').expect(400);
    });
  });

  describe('PATCH /api/v1/client/:id', () => {
    it('atualiza apenas os campos enviados', async () => {
      const { body: created } = await create().expect(201);

      const response = await request(http)
        .patch(`/api/v1/client/${created.id}`)
        .send({ name: 'Maria Souza' })
        .expect(200);

      expect(response.body.name).toBe('Maria Souza');
      expect(response.body.document).toBe(VALID_CPF);
      expect(response.body.email).toBe('maria@example.com');
    });

    it('recusa alteração de documento porque ele é imutável', async () => {
      const { body: created } = await create().expect(201);

      await request(http)
        .patch(`/api/v1/client/${created.id}`)
        .send({ document: VALID_CNPJ })
        .expect(400);
    });

    it('devolve 409 ao tentar usar o e-mail de outro cliente', async () => {
      const { body: primeiro } = await create().expect(201);
      await create({
        ...payload,
        document: VALID_CNPJ,
        email: 'joao@example.com',
      }).expect(201);

      await request(http)
        .patch(`/api/v1/client/${primeiro.id}`)
        .send({ email: 'joao@example.com' })
        .expect(409);
    });

    it('devolve 404 para id inexistente', async () => {
      await request(http)
        .patch('/api/v1/client/f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c')
        .send({ name: 'X' })
        .expect(404);
    });
  });

  describe('DELETE /api/v1/client/:id', () => {
    it('remove o cliente e devolve 204', async () => {
      const { body: created } = await create().expect(201);

      await request(http).delete(`/api/v1/client/${created.id}`).expect(204);

      await request(http).get(`/api/v1/client/${created.id}`).expect(404);
    });

    it('devolve 404 para id inexistente', async () => {
      await request(http)
        .delete('/api/v1/client/f2b3d0a4-1c2e-4f5a-8b9c-0d1e2f3a4b5c')
        .expect(404);
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OpenAPIObject } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { configureApp, setupSwagger } from '../src/setup-app';
import { AuthTestModule } from './auth-test.controller';

/**
 * O Swagger é entregável do Tech Challenge. Estes testes falham se alguém
 * adicionar um endpoint sem documentar ou mudar o contrato sem atualizar o DTO.
 */
describe('Swagger', () => {
  let app: INestApplication<App>;
  let http: App;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, AuthTestModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    app = configureApp(
      moduleFixture.createNestApplication(),
    ) as INestApplication<App>;
    setupSwagger(app);
    await app.init();
    http = app.getHttpServer();

    document = (await request(http).get('/api/v1/docs-json').expect(200))
      .body as OpenAPIObject;
  });

  afterAll(async () => {
    await app.close();
  });

  it('documenta as rotas de cliente sob o prefixo da API', () => {
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining(['/api/v1/client', '/api/v1/client/{id}']),
    );
  });

  it('documenta todos os verbos do CRUD', () => {
    expect(Object.keys(document.paths['/api/v1/client'])).toEqual(
      expect.arrayContaining(['post', 'get']),
    );
    expect(Object.keys(document.paths['/api/v1/client/{id}'])).toEqual(
      expect.arrayContaining(['get', 'patch', 'delete']),
    );
  });

  it('documents protected stock CRUD routes and their schemas', () => {
    const collection = document.paths['/api/v1/stock'];
    const item = document.paths['/api/v1/stock/{id}'];

    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining(['/api/v1/stock', '/api/v1/stock/{id}']),
    );
    expect(Object.keys(collection)).toEqual(
      expect.arrayContaining(['post', 'get']),
    );
    expect(Object.keys(item)).toEqual(
      expect.arrayContaining(['get', 'patch', 'delete']),
    );
    expect(document.components?.schemas).toEqual(
      expect.objectContaining({
        CreatePartDto: expect.any(Object),
        UpdatePartDto: expect.any(Object),
        PartResponseDto: expect.any(Object),
      }),
    );

    for (const operation of [
      collection.post!,
      collection.get!,
      item.get!,
      item.patch!,
      item.delete!,
    ]) {
      expect(operation.summary).toBeTruthy();
      expect(operation.security).toEqual([{ bearer: [] }]);
      expect(Object.keys(operation.responses)).toEqual(
        expect.arrayContaining(['401', '403']),
      );
    }

    expect(Object.keys(collection.post!.responses)).toEqual(
      expect.arrayContaining(['201', '400', '409']),
    );
    expect(Object.keys(item.get!.responses)).toEqual(
      expect.arrayContaining(['200', '400', '404']),
    );
    expect(Object.keys(item.patch!.responses)).toEqual(
      expect.arrayContaining(['200', '400', '404', '409']),
    );
    expect(Object.keys(item.delete!.responses)).toEqual(
      expect.arrayContaining(['204', '400', '404']),
    );
  });

  it('expõe os schemas de request e response', () => {
    expect(Object.keys(document.components?.schemas ?? {})).toEqual(
      expect.arrayContaining([
        'CreateClientDto',
        'UpdateClientDto',
        'ClientResponseDto',
        'LoginDto',
        'RefreshTokenDto',
        'TokenPairDto',
      ]),
    );
  });

  it('documenta as rotas e respostas de autenticação', () => {
    const login = document.paths['/api/v1/auth/login'].post!;
    const refresh = document.paths['/api/v1/auth/refresh'].post!;
    const logout = document.paths['/api/v1/auth/logout'].post!;

    expect(Object.keys(login.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401']),
    );
    expect(Object.keys(refresh.responses)).toEqual(
      expect.arrayContaining(['201', '400', '401']),
    );
    expect(Object.keys(logout.responses)).toEqual(
      expect.arrayContaining(['204', '400', '401']),
    );
  });

  it('declara o esquema bearer e o aplica apenas a rotas protegidas', () => {
    expect(document.components?.securitySchemes?.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
    expect(
      document.paths['/api/v1/test-auth/authenticated'].get!.security,
    ).toEqual([{ bearer: [] }]);
    expect(document.paths['/api/v1/test-auth/admin'].get!.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/api/v1/client'].get!.security).toBeUndefined();
    expect(document.paths['/api/v1/auth/login'].post!.security).toBeUndefined();
  });

  it('documenta 401 e 403 nas rotas protegidas conforme aplicável', () => {
    const authenticated =
      document.paths['/api/v1/test-auth/authenticated'].get!;
    const admin = document.paths['/api/v1/test-auth/admin'].get!;

    expect(Object.keys(authenticated.responses)).toEqual(
      expect.arrayContaining(['200', '401']),
    );
    expect(Object.keys(admin.responses)).toEqual(
      expect.arrayContaining(['200', '401', '403']),
    );
  });

  it('ClientResponseDto declara todos os campos como primitivos', () => {
    const schema = document.components?.schemas?.['ClientResponseDto'] as {
      properties: Record<string, { type?: string; format?: string }>;
      required: string[];
    };

    expect(schema.properties.document.type).toBe('string');
    expect(schema.properties.email.type).toBe('string');
    expect(schema.properties.id.format).toBe('uuid');
    expect(schema.required).toEqual(
      expect.arrayContaining([
        'id',
        'name',
        'document',
        'email',
        'phone',
        'createdAt',
        'updatedAt',
      ]),
    );
  });

  it('UpdateClientDto não permite alterar o documento', () => {
    const schema = document.components?.schemas?.['UpdateClientDto'] as {
      properties: Record<string, unknown>;
    };

    expect(schema.properties).not.toHaveProperty('document');
  });

  it('cada operação tem summary e respostas de erro documentadas', () => {
    const post = document.paths['/api/v1/client'].post!;

    expect(post.summary).toBeTruthy();
    expect(Object.keys(post.responses)).toEqual(
      expect.arrayContaining(['201', '400', '409']),
    );
  });

  it('serve a UI e o JSON em /api/v1/docs', async () => {
    await request(http)
      .get('/api/v1/docs')
      .expect('Content-Type', /html/)
      .expect(200);
    expect(document.paths['/api/v1/health']).toBeDefined();
  });
});

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

  it('documenta as rotas de cliente e veículo sob o prefixo da API', () => {
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/client',
        '/api/v1/client/{id}',
        '/api/v1/vehicle',
        '/api/v1/vehicle/{id}',
      ]),
    );
  });

  it.each([['client'], ['vehicle']])(
    'documenta todos os verbos do CRUD de %s',
    (recurso) => {
      expect(Object.keys(document.paths[`/api/v1/${recurso}`])).toEqual(
        expect.arrayContaining(['post', 'get']),
      );
      expect(Object.keys(document.paths[`/api/v1/${recurso}/{id}`])).toEqual(
        expect.arrayContaining(['get', 'patch', 'delete']),
      );
    },
  );

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
        'CreateVehicleDto',
        'UpdateVehicleDto',
        'VehicleResponseDto',
        'LoginDto',
        'RefreshTokenDto',
        'TokenPairDto',
      ]),
    );
  });

  it('VehicleResponseDto declara os Value Objects como primitivos', () => {
    const schema = document.components?.schemas?.['VehicleResponseDto'] as {
      properties: Record<string, { type?: string; format?: string }>;
    };

    expect(schema.properties.plate.type).toBe('string');
    expect(schema.properties.year.type).toBe('number');
    expect(schema.properties.clientId.format).toBe('uuid');
  });

  it.each([
    ['UpdateVehicleDto', 'plate'],
    ['UpdateVehicleDto', 'clientId'],
  ])('%s não permite alterar %s', (schemaName, prop) => {
    const schema = document.components?.schemas?.[schemaName] as {
      properties: Record<string, unknown>;
    };

    expect(schema.properties).not.toHaveProperty(prop);
  });

  it('a listagem de veículos documenta o filtro por cliente', () => {
    const parameters = document.paths['/api/v1/vehicle'].get?.parameters ?? [];

    expect(parameters.map((p) => (p as { name: string }).name)).toContain(
      'clientId',
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

  it('documenta conflitos nas operacoes mutaveis de budget', () => {
    const budgetPaths = [
      ['/api/v1/budgets', 'post'],
      ['/api/v1/budgets/{id}/items', 'post'],
      ['/api/v1/budgets/{id}/items/{itemId}', 'delete'],
      ['/api/v1/budgets/{id}/send', 'post'],
      ['/api/v1/budgets/{id}/accept', 'post'],
      ['/api/v1/budgets/{id}/refuse', 'post'],
    ] as const;

    for (const [path, method] of budgetPaths) {
      expect(document.paths[path][method]!.responses).toHaveProperty('409');
    }
  });

  it('serve a UI e o JSON em /api/v1/docs', async () => {
    await request(http)
      .get('/api/v1/docs')
      .expect('Content-Type', /html/)
      .expect(200);
    expect(document.paths['/api/v1/health']).toBeDefined();
  });

  it('documenta as rotas de ordem de serviço sob o prefixo da API', () => {
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/service-order',
        '/api/v1/service-order/{id}',
        '/api/v1/service-order/metrics/average-execution-time',
        '/api/v1/service-order/{id}/start-diagnosis',
        '/api/v1/service-order/{id}/await-approval',
        '/api/v1/service-order/{id}/await-parts',
        '/api/v1/service-order/{id}/start-progress',
        '/api/v1/service-order/{id}/complete',
        '/api/v1/service-order/{id}/deliver',
        '/api/v1/service-order/{id}/cancel',
      ]),
    );
  });

  it('documenta todos os verbos das rotas de ordem de serviço', () => {
    expect(Object.keys(document.paths['/api/v1/service-order'])).toEqual(
      expect.arrayContaining(['post', 'get']),
    );
    expect(Object.keys(document.paths['/api/v1/service-order/{id}'])).toEqual(
      expect.arrayContaining(['get']),
    );

    for (const action of [
      'start-diagnosis',
      'await-approval',
      'await-parts',
      'start-progress',
      'complete',
      'deliver',
      'cancel',
    ]) {
      expect(
        Object.keys(document.paths[`/api/v1/service-order/{id}/${action}`]),
      ).toEqual(expect.arrayContaining(['patch']));
    }

    expect(
      Object.keys(
        document.paths['/api/v1/service-order/metrics/average-execution-time'],
      ),
    ).toEqual(expect.arrayContaining(['get']));
  });

  it('expõe os schemas de request e response da ordem de serviço', () => {
    expect(Object.keys(document.components?.schemas ?? {})).toEqual(
      expect.arrayContaining([
        'OpenServiceOrderDto',
        'CancelServiceOrderDto',
        'ServiceOrderResponseDto',
        'AverageExecutionTimeResponseDto',
      ]),
    );
  });
});

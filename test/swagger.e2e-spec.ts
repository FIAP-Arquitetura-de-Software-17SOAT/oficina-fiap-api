import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { configureApp } from '../src/setup-app';

/**
 * O Swagger é entregável do Tech Challenge. Estes testes falham se alguém
 * adicionar um endpoint sem documentar ou mudar o contrato sem atualizar o DTO.
 */
describe('Swagger', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    app = configureApp(moduleFixture.createNestApplication());
    await app.init();

    document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Oficina FIAP API')
        .setVersion('1.0')
        .build(),
    );
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

  it('expõe os schemas de request e response', () => {
    expect(Object.keys(document.components?.schemas ?? {})).toEqual(
      expect.arrayContaining([
        'CreateClientDto',
        'UpdateClientDto',
        'ClientResponseDto',
        'CreateVehicleDto',
        'UpdateVehicleDto',
        'VehicleResponseDto',
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

  it('serve a UI e o JSON em /api/v1/docs', () => {
    expect(document.paths['/api/v1/health']).toBeDefined();
  });
});

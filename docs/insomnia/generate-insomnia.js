const { Test } = require('@nestjs/testing');
const request = require('supertest');
const { mkdirSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');

const { AppModule } = require('../../dist/src/app.module.js');
const { configureApp, setupSwagger } = require('../../dist/src/setup-app.js');
const { PrismaService } = require('../../dist/src/shared/database/prisma.service.js');
const { JwtAuthGuard } = require('../../dist/src/shared/http/auth/jwt-auth.guard.js');

const OUTPUT_OPENAPI = join('docs', 'insomnia', 'openapi.json');
const OUTPUT_INSOMNIA = join('docs', 'insomnia', 'oficina-fiap-api.insomnia.json');
const BASE_URL = 'http://localhost:3000';
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

async function createOpenApiDocument() {
  let app;

  try {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(JwtAuthGuard)
      .useValue({
        canActivate: (context) => {
          context.switchToHttp().getRequest().user = {
            sub: 'insomnia-export-user',
            role: 'ADMIN',
            type: 'access',
            jti: 'insomnia-export-jti',
          };

          return true;
        },
      })
      .compile();

    app = configureApp(moduleFixture.createNestApplication());
    setupSwagger(app);
    await app.init();

    const response = await request(app.getHttpServer())
      .get('/api/v1/docs-json')
      .expect(200);

    return response.body;
  } finally {
    if (app) {
      await app.close();
    }
  }
}

function id(prefix, value) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

  return `${prefix}_${slug || 'root'}`;
}

function operationName(method, path, operation) {
  return operation.summary || `${method.toUpperCase()} ${path}`;
}

function operationGroup(path, operation) {
  return operation.tags?.[0] || path.split('/').filter(Boolean)[2] || 'general';
}

function schemaByRef(document, ref) {
  const schemaName = ref.replace('#/components/schemas/', '');

  return document.components?.schemas?.[schemaName];
}

function resolveSchema(document, schema) {
  if (!schema) {
    return undefined;
  }

  if (schema.$ref) {
    return resolveSchema(document, schemaByRef(document, schema.$ref));
  }

  const composed = schema.allOf || schema.oneOf || schema.anyOf;
  if (composed?.length) {
    return composed.map((item) => resolveSchema(document, item)).find(Boolean);
  }

  return schema;
}

function sampleForSchema(document, schema, propertyName = 'value', depth = 0) {
  const resolved = resolveSchema(document, schema);

  if (!resolved || depth > 8) {
    return null;
  }

  if (resolved.example !== undefined) {
    return resolved.example;
  }

  if (resolved.default !== undefined) {
    return resolved.default;
  }

  if (resolved.enum?.length) {
    return resolved.enum[0];
  }

  if (resolved.type === 'array') {
    return [sampleForSchema(document, resolved.items, propertyName, depth + 1)];
  }

  if (resolved.type === 'object' || resolved.properties) {
    return Object.fromEntries(
      Object.entries(resolved.properties || {}).map(([name, childSchema]) => [
        name,
        sampleForSchema(document, childSchema, name, depth + 1),
      ]),
    );
  }

  if (resolved.type === 'integer' || resolved.type === 'number') {
    const lowerName = propertyName.toLowerCase();

    return lowerName.includes('price') ||
      lowerName.includes('total') ||
      lowerName.includes('cost')
      ? 99.9
      : 1;
  }

  if (resolved.type === 'boolean') {
    return true;
  }

  if (resolved.format === 'date-time') {
    return '2026-08-23T12:00:00.000Z';
  }

  if (resolved.format === 'date') {
    return '2026-08-23';
  }

  if (resolved.format === 'email' || propertyName.toLowerCase().includes('email')) {
    return 'cliente@example.com';
  }

  if (propertyName.toLowerCase().endsWith('id')) {
    return `{{ _.${propertyName} }}`;
  }

  if (propertyName.toLowerCase().includes('password')) {
    return 'Senha@123';
  }

  return propertyName;
}

function sampleForParameter(document, parameter) {
  const sample =
    parameter.example || sampleForSchema(document, parameter.schema, parameter.name);

  return String(sample || `{{ _.${parameter.name} }}`);
}

function requestBody(document, operation) {
  const jsonContent = operation.requestBody?.content?.['application/json'];

  if (!jsonContent?.schema) {
    return {};
  }

  return {
    mimeType: 'application/json',
    text: JSON.stringify(sampleForSchema(document, jsonContent.schema), null, 2),
  };
}

function urlForPath(path, parameters = []) {
  const pathParameters = parameters.filter((parameter) => parameter.in === 'path');

  return pathParameters.reduce(
    (url, parameter) => url.replace(`{${parameter.name}}`, `{{ _.${parameter.name} }}`),
    `{{ _.base_url }}${path}`,
  );
}

function queryParameters(document, parameters = []) {
  return parameters
    .filter((parameter) => parameter.in === 'query')
    .map((parameter) => ({
      name: parameter.name,
      value: sampleForParameter(document, parameter),
      disabled: !parameter.required,
    }));
}

function buildInsomniaExport(document) {
  const created = Date.now();
  const workspaceId = 'wrk_oficina_fiap_api';
  const environmentId = 'env_oficina_fiap_api_base';
  const resources = [
    {
      _id: workspaceId,
      parentId: null,
      modified: created,
      created,
      name: document.info?.title || 'Oficina FIAP API',
      description: document.info?.description || '',
      scope: 'collection',
      _type: 'workspace',
    },
    {
      _id: environmentId,
      parentId: workspaceId,
      modified: created,
      created,
      name: 'Base Environment',
      data: {
        base_url: BASE_URL,
        token: '',
        id: 'replace-with-id',
        clientId: 'replace-with-client-id',
        vehicleId: 'replace-with-vehicle-id',
        serviceOrderId: 'replace-with-service-order-id',
        budgetId: 'replace-with-budget-id',
        partId: 'replace-with-part-id',
        purchaseOrderId: 'replace-with-purchase-order-id',
        billingId: 'replace-with-billing-id',
      },
      dataPropertyOrder: null,
      color: null,
      isPrivate: false,
      metaSortKey: created,
      _type: 'environment',
    },
  ];

  const groups = new Map();
  let sort = 0;

  for (const [path, pathItem] of Object.entries(document.paths).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];

      if (!operation) {
        continue;
      }

      const groupName = operationGroup(path, operation);
      const groupId = id('fld', groupName);

      if (!groups.has(groupName)) {
        groups.set(groupName, groupId);
        resources.push({
          _id: groupId,
          parentId: workspaceId,
          modified: created,
          created,
          name: groupName,
          environment: {},
          environmentPropertyOrder: null,
          metaSortKey: sort++,
          _type: 'request_group',
        });
      }

      const parameters = operation.parameters || [];
      const secure = Boolean(operation.security?.length);
      const headers = [];
      const body = requestBody(document, operation);

      if (body.mimeType) {
        headers.push({ name: 'Content-Type', value: 'application/json' });
      }

      if (secure) {
        headers.push({ name: 'Authorization', value: 'Bearer {{ _.token }}' });
      }

      resources.push({
        _id: id('req', `${method}_${path}_${operation.operationId || operation.summary || ''}`),
        parentId: groupId,
        modified: created,
        created,
        url: urlForPath(path, parameters),
        name: operationName(method, path, operation),
        description: '',
        method: method.toUpperCase(),
        body,
        parameters: queryParameters(document, parameters),
        headers,
        authentication: {},
        metaSortKey: sort++,
        isPrivate: false,
        settingStoreCookies: true,
        settingSendCookies: true,
        settingDisableRenderRequestBody: false,
        settingEncodeUrl: true,
        settingRebuildPath: true,
        settingFollowRedirects: 'global',
        _type: 'request',
      });
    }
  }

  return {
    _type: 'export',
    __export_format: 4,
    __export_date: new Date(created).toISOString(),
    __export_source: 'oficina-fiap-api swagger export',
    resources,
  };
}

async function main() {
  const document = await createOpenApiDocument();
  const insomniaExport = buildInsomniaExport(document);

  mkdirSync(dirname(OUTPUT_OPENAPI), { recursive: true });
  writeFileSync(OUTPUT_OPENAPI, `${JSON.stringify(document, null, 2)}\n`);
  writeFileSync(OUTPUT_INSOMNIA, `${JSON.stringify(insomniaExport, null, 2)}\n`);

  const requestCount = insomniaExport.resources.filter(
    (resource) => resource._type === 'request',
  ).length;

  console.log(`Generated ${OUTPUT_OPENAPI}`);
  console.log(`Generated ${OUTPUT_INSOMNIA}`);
  console.log(`Requests: ${requestCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

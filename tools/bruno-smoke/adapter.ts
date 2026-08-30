import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { SmokeCollection, SmokeStep } from './types';

function indent(lines: string[], spaces = 2): string[] {
  const pad = ' '.repeat(spaces);
  return lines.map((line) => `${pad}${line}`);
}

function renderKeyValueBlock(
  name: string,
  values: Record<string, string>,
): string[] {
  const entries = Object.entries(values);
  if (entries.length === 0) return [];
  return [name + ' {', ...entries.map(([key, value]) => `  ${key}: ${value}`), '}'];
}

function renderScriptBlock(name: string, script?: string[]): string[] {
  if (!script || script.length === 0) return [];
  return [`${name} {`, ...indent(script), '}'];
}

export function fileNameForStep(step: SmokeStep): string {
  return `${String(step.sequence).padStart(2, '0')}-${step.slug}.bru`;
}

export function renderCollectionConfig(collection: SmokeCollection): string {
  return (
    JSON.stringify(
      {
        version: '1',
        name: collection.name,
        type: 'collection',
        defaultEnvironment: collection.environmentName,
      },
      null,
      2,
    ) + '\n'
  );
}

export function renderEnvironment(): string {
  return [
    'vars {',
    '  baseUrl: http://localhost:3000/api/v1',
    '  email: {{process.env.ADMIN_EMAIL}}',
    '  password: {{process.env.ADMIN_PASSWORD}}',
    '  useRandomData: true',
    '  clientName: Bruno QA Manual',
    '  document: 11222333000181',
    '  clientEmail: bruno.qa.manual@example.com',
    '  clientPhone: (11) 98888-7777',
    '  plate: QAA1A11',
    '  vehicleBrand: Fiat',
    '  vehicleModel: Argo',
    '  vehicleYear: 2022',
    '  serviceName: Troca de oleo manual',
    '  serviceDescription: Servico manual para smoke QA',
    '  partCode: MANUAL-PART-001',
    '  partName: Filtro manual',
    '  partDescription: Peca manual para smoke QA',
    '  serviceOrderDescription: Atendimento manual de QA',
    '  budgetServiceDescription: Servico manual',
    '  budgetPartDescription: Peca manual',
    '  stockIdempotencyKey: entrada-manual-001',
    '  mechanicId: 00000000-0000-4000-8000-000000000001',
    '}',
    '',
  ].join('\n');
}

export function renderRequest(step: SmokeStep): string {
  const headers = {
    ...(step.auth
      ? { Authorization: `Bearer {{${step.auth.bearerTokenVar}}}` }
      : {}),
    ...(step.headers ?? {}),
  };

  const body =
    step.body === undefined
      ? []
      : [
          'body:json {',
          ...indent(JSON.stringify(step.body, null, 2).split('\n')),
          '}',
        ];

  const tags =
    step.tags && step.tags.length > 0
      ? ['tags: [', ...indent(step.tags, 4), ']']
      : [];

  return [
    'meta {',
    `  name: ${step.name}`,
    '  type: http',
    `  seq: ${step.sequence}`,
    ...indent(tags),
    '}',
    '',
    `${step.method.toLowerCase()} {`,
    `  url: ${step.url}`,
    `  method: ${step.method}`,
    ...(step.body === undefined ? [] : ['  body: json']),
    '}',
    '',
    ...renderKeyValueBlock('headers', headers),
    ...(Object.keys(headers).length > 0 ? [''] : []),
    ...body,
    ...(body.length > 0 ? [''] : []),
    ...renderScriptBlock('script:pre-request', step.preRequest),
    ...(step.preRequest?.length ? [''] : []),
    ...renderScriptBlock('tests', step.tests),
    '',
  ].join('\n');
}

export async function generateCollection(
  collection: SmokeCollection,
): Promise<void> {
  await rm(collection.folder, { recursive: true, force: true });
  await mkdir(join(collection.folder, 'environments'), { recursive: true });

  await writeFile(join(collection.folder, 'bruno.json'), renderCollectionConfig(collection));
  await writeFile(
    join(collection.folder, 'environments', `${collection.environmentName}.bru`),
    renderEnvironment(),
  );

  for (const step of collection.steps) {
    const filePath = join(collection.folder, fileNameForStep(step));
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, renderRequest(step));
  }
}

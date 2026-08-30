# Bruno Smoke QA Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um adapter TypeScript que gera uma coleção Bruno de smoke test/QA externo para validar o fluxo feliz principal da API publicada, sem duplicar a suíte Jest E2E.

**Architecture:** TypeScript vira a fonte editável do smoke: define requests, bodies, variáveis capturadas e scripts mínimos. O adapter gera arquivos `.bru` em `bruno/oficina-fiap-smoke`, consumidos pelo Bruno Desktop e Bruno CLI. Jest segue como suíte oficial de regras e E2E profundo; Bruno valida a API como caixa-preta e gera evidência para QA/professor.

**Tech Stack:** TypeScript, `ts-node`, Bruno `.bru` file format, `@usebruno/cli`, Bruno JavaScript tests com Chai `expect`, NestJS 11 API, PostgreSQL, Prisma 7, Stripe CLI opcional.

**Spec:** `Oficina FIAP — Fluxo E2E.postman_collection.json`

## Global Constraints

- Não alterar código da API para atender Bruno.
- Não duplicar cenários já cobertos por `test/workshop-flow.e2e-spec.ts`.
- Manter `npm run test:e2e` como gate principal de qualidade técnica.
- Bruno cobre só smoke externo do fluxo feliz contra API já subida.
- Source of truth da coleção Bruno deve ser TypeScript em `tools/bruno-smoke`.
- Arquivos `.bru` são saída gerada; evitar edição manual permanente neles.
- Rodar Bruno contra `http://localhost:3000/api/v1`.
- Usar dados únicos por execução para evitar conflitos de `@unique`.
- Não versionar senha real; `email` e `password` vêm de variáveis de ambiente.
- Entrega paga fica opcional/manual quando depender de Stripe CLI/webhook.

---

## File Structure

- Create: `tools/bruno-smoke/types.ts`
  - Tipos do DSL mínimo para requests Bruno.
- Create: `tools/bruno-smoke/adapter.ts`
  - Converte steps TypeScript em conteúdo `.bru`.
- Create: `tools/bruno-smoke/flow.ts`
  - Define smoke steps 00-14 e request opcional 15.
- Create: `tools/bruno-smoke/generate.ts`
  - CLI gerador da coleção.
- Create: `tools/bruno-smoke/adapter.spec.ts`
  - Testes unitários do adapter.
- Create: `bruno/oficina-fiap-smoke/`
  - Coleção Bruno gerada.
- Create: `reports/bruno/.gitkeep`
  - Mantém diretório de relatórios.
- Create: `docs/bruno-smoke-qa.md`
  - Guia para QA externo.
- Modify: `package.json`
  - Scripts `bruno:generate`, `bruno:smoke`, `bruno:smoke:report`, `bruno:smoke:optional-delivery`.
- Modify: `package-lock.json`
  - Lockfile gerado por instalação do Bruno CLI.

---

### Task 1: Tipos do DSL Bruno Smoke

**Files:**
- Create: `tools/bruno-smoke/types.ts`
- Test: `tools/bruno-smoke/adapter.spec.ts`

**Interfaces:**
- Produces: `SmokeCollection`, `SmokeStep`, `HttpMethod`, `BrunoAuth`, `BrunoScript`

- [ ] **Step 1: Criar teste de contrato dos tipos via adapter futuro**

Criar `tools/bruno-smoke/adapter.spec.ts`:

```ts
import { describe, expect, it } from '@jest/globals';
import { renderRequest } from './adapter';
import { SmokeStep } from './types';

describe('Bruno smoke adapter', () => {
  it('renders a typed request as a .bru document', () => {
    const step: SmokeStep = {
      sequence: 0,
      slug: 'health-check',
      name: 'Health check',
      method: 'GET',
      url: '{{baseUrl}}/health',
      tests: [
        'test("API responde health check", function () {',
        '  expect(res.getStatus()).to.equal(200);',
        '});',
      ],
    };

    expect(renderRequest(step)).toContain('name: Health check');
    expect(renderRequest(step)).toContain('method: GET');
    expect(renderRequest(step)).toContain('url: {{baseUrl}}/health');
  });
});
```

- [ ] **Step 2: Rodar teste para confirmar falha**

Run:

```bash
npm test -- --runTestsByPath tools/bruno-smoke/adapter.spec.ts
```

Expected: FAIL porque `tools/bruno-smoke/adapter.ts` e `types.ts` ainda não existem.

- [ ] **Step 3: Criar `types.ts`**

```ts
export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type BrunoAuth = {
  bearerTokenVar: string;
};

export type BrunoScript = string[];

export type SmokeStep = {
  sequence: number;
  slug: string;
  name: string;
  method: HttpMethod;
  url: string;
  tags?: string[];
  auth?: BrunoAuth;
  headers?: Record<string, string>;
  body?: unknown;
  preRequest?: BrunoScript;
  tests?: BrunoScript;
};

export type SmokeCollection = {
  name: string;
  folder: string;
  environmentName: string;
  steps: SmokeStep[];
};
```

- [ ] **Step 4: Criar adapter mínimo para passar teste**

Criar `tools/bruno-smoke/adapter.ts`:

```ts
import { SmokeStep } from './types';

export function renderRequest(step: SmokeStep): string {
  return [
    'meta {',
    `  name: ${step.name}`,
    `  type: http`,
    `  seq: ${step.sequence}`,
    '}',
    '',
    `${step.method.toLowerCase()} {`,
    `  url: ${step.url}`,
    `  method: ${step.method}`,
    '}',
    '',
  ].join('\n');
}
```

- [ ] **Step 5: Rodar teste**

Run:

```bash
npm test -- --runTestsByPath tools/bruno-smoke/adapter.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/bruno-smoke/types.ts tools/bruno-smoke/adapter.ts tools/bruno-smoke/adapter.spec.ts
git commit -m "test: add typed bruno smoke adapter contract"
```

---

### Task 2: Renderização completa de `.bru`

**Files:**
- Modify: `tools/bruno-smoke/adapter.ts`
- Modify: `tools/bruno-smoke/adapter.spec.ts`

**Interfaces:**
- Consumes: `SmokeStep`
- Produces: `renderRequest(step: SmokeStep): string`, `fileNameForStep(step: SmokeStep): string`

- [ ] **Step 1: Expandir teste para headers, body, scripts e tags**

Adicionar em `adapter.spec.ts`:

```ts
it('renders headers, auth, json body, scripts, tests, and tags', () => {
  const step: SmokeStep = {
    sequence: 2,
    slug: 'cria-cliente',
    name: 'Cria cliente',
    method: 'POST',
    url: '{{baseUrl}}/clients',
    tags: ['smoke'],
    auth: { bearerTokenVar: 'accessToken' },
    headers: { 'Content-Type': 'application/json' },
    body: { name: 'Maria Silva', email: '{{clientEmail}}' },
    preRequest: ['bru.setVar("runId", Date.now());'],
    tests: ['test("cliente criado", function () { expect(res.getStatus()).to.equal(201); });'],
  };

  const output = renderRequest(step);

  expect(output).toContain('tags: smoke');
  expect(output).toContain('Authorization: Bearer {{accessToken}}');
  expect(output).toContain('"email": "{{clientEmail}}"');
  expect(output).toContain('script:pre-request {');
  expect(output).toContain('tests {');
});
```

- [ ] **Step 2: Testar falha**

Run:

```bash
npm test -- --runTestsByPath tools/bruno-smoke/adapter.spec.ts
```

Expected: FAIL porque adapter ainda não renderiza todos os blocos.

- [ ] **Step 3: Implementar renderização**

Substituir `adapter.ts`:

```ts
import { SmokeStep } from './types';

function indent(lines: string[], spaces = 2): string[] {
  const pad = ' '.repeat(spaces);
  return lines.map((line) => `${pad}${line}`);
}

function renderKeyValueBlock(name: string, values: Record<string, string>): string[] {
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

export function renderRequest(step: SmokeStep): string {
  const headers = {
    ...(step.auth ? { Authorization: `Bearer {{${step.auth.bearerTokenVar}}}` } : {}),
    ...(step.headers ?? {}),
  };

  const body =
    step.body === undefined
      ? []
      : ['body:json {', ...indent(JSON.stringify(step.body, null, 2).split('\n')), '}'];

  const tags = step.tags && step.tags.length > 0 ? [`tags: ${step.tags.join(',')}`] : [];

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
```

- [ ] **Step 4: Rodar teste**

Run:

```bash
npm test -- --runTestsByPath tools/bruno-smoke/adapter.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/bruno-smoke/adapter.ts tools/bruno-smoke/adapter.spec.ts
git commit -m "test: render bruno smoke request files"
```

---

### Task 3: Definir fluxo smoke em TypeScript

**Files:**
- Create: `tools/bruno-smoke/flow.ts`
- Modify: `tools/bruno-smoke/adapter.spec.ts`

**Interfaces:**
- Consumes: `SmokeCollection`, `SmokeStep`
- Produces: `collection: SmokeCollection`

- [ ] **Step 1: Testar formato do fluxo**

Adicionar em `adapter.spec.ts`:

```ts
import { collection } from './flow';

it('keeps Bruno smoke focused on the happy path plus optional delivery', () => {
  expect(collection.name).toBe('Oficina FIAP - Smoke QA');
  expect(collection.steps).toHaveLength(16);
  expect(collection.steps.filter((step) => step.tags?.includes('optional'))).toHaveLength(1);
  expect(collection.steps[0].slug).toBe('health-check');
  expect(collection.steps[14].slug).toBe('gera-cobranca');
  expect(collection.steps[15].slug).toBe('entrega-os-opcional');
});
```

- [ ] **Step 2: Rodar teste para confirmar falha**

Run:

```bash
npm test -- --runTestsByPath tools/bruno-smoke/adapter.spec.ts
```

Expected: FAIL porque `flow.ts` ainda não existe.

- [ ] **Step 3: Criar `flow.ts`**

```ts
import { SmokeCollection, SmokeStep } from './types';

const auth = { bearerTokenVar: 'accessToken' };
const json = { 'Content-Type': 'application/json' };

const stopOnError = [
  'if (res.getStatus() >= 400) {',
  '  bru.runner.setNextRequest(null);',
  '}',
];

const captureId = (name: string): string[] => [
  'if (res.getStatus() === 200 || res.getStatus() === 201) {',
  `  bru.setVar("${name}", res.getBody().id);`,
  '} else {',
  '  bru.runner.setNextRequest(null);',
  '}',
];

const steps: SmokeStep[] = [
  {
    sequence: 0,
    slug: 'health-check',
    name: 'Health check',
    method: 'GET',
    url: '{{baseUrl}}/health',
    preRequest: [
      'const rnd = (n) => Math.floor(Math.random() * n);',
      'const letter = () => String.fromCharCode(65 + rnd(26));',
      'const runId = Date.now();',
      'const base = Array.from({ length: 9 }, () => rnd(10));',
      'const dv = (digits, weight) => {',
      '  const sum = digits.reduce((acc, digit, index) => acc + digit * (weight - index), 0);',
      '  const rest = sum % 11;',
      '  return rest < 2 ? 0 : 11 - rest;',
      '};',
      'const d1 = dv(base, 10);',
      'const d2 = dv([...base, d1], 11);',
      'const suffix = (runId % 0xffffffffffff).toString(16).padStart(12, "0");',
      'bru.setVar("runId", runId);',
      'bru.setVar("cpf", [...base, d1, d2].join(""));',
      'bru.setVar("plate", `${letter()}${letter()}${letter()}${rnd(10)}${letter()}${rnd(10)}${rnd(10)}`);',
      'bru.setVar("clientEmail", `maria.${runId}@example.com`);',
      'bru.setVar("mechanicId", `00000000-0000-4000-8000-${suffix}`);',
    ],
    tests: [
      'test("API responde health check", function () {',
      '  expect(res.getStatus()).to.equal(200);',
      '});',
      ...stopOnError,
    ],
  },
  {
    sequence: 1,
    slug: 'login',
    name: 'Login',
    method: 'POST',
    url: '{{baseUrl}}/auth/login',
    headers: json,
    body: { email: '{{email}}', password: '{{password}}' },
    tests: [
      'test("login retorna tokens", function () {',
      '  expect(res.getStatus()).to.equal(200);',
      '  expect(res.getBody().accessToken).to.be.a("string").and.not.empty;',
      '  expect(res.getBody().refreshToken).to.be.a("string").and.not.empty;',
      '});',
      'if (res.getStatus() === 200) {',
      '  bru.setVar("accessToken", res.getBody().accessToken);',
      '  bru.setVar("refreshToken", res.getBody().refreshToken);',
      '} else {',
      '  bru.runner.setNextRequest(null);',
      '}',
    ],
  },
  {
    sequence: 2,
    slug: 'cria-cliente',
    name: 'Cria cliente',
    method: 'POST',
    url: '{{baseUrl}}/clients',
    auth,
    headers: json,
    body: { name: 'Maria Silva', document: '{{cpf}}', email: '{{clientEmail}}', phone: '(11) 99999-8888' },
    tests: ['test("cliente criado", function () { expect(res.getStatus()).to.equal(201); });', ...captureId('clientId')],
  },
  {
    sequence: 3,
    slug: 'cadastra-veiculo',
    name: 'Cadastra veiculo',
    method: 'POST',
    url: '{{baseUrl}}/vehicles',
    auth,
    headers: json,
    body: { clientId: '{{clientId}}', plate: '{{plate}}', brand: 'Fiat', model: 'Argo', year: 2022 },
    tests: ['test("veiculo criado", function () { expect(res.getStatus()).to.equal(201); });', ...captureId('vehicleId')],
  },
  {
    sequence: 4,
    slug: 'cadastra-servico-catalogo',
    name: 'Cadastra servico no catalogo',
    method: 'POST',
    url: '{{baseUrl}}/services',
    auth,
    headers: json,
    body: { name: 'Troca de oleo e filtro {{runId}}', description: 'Inclui oleo 5W30 e filtro', price: 149.9 },
    tests: ['test("servico criado", function () { expect(res.getStatus()).to.equal(201); });', ...captureId('serviceId')],
  },
  {
    sequence: 5,
    slug: 'cadastra-peca',
    name: 'Cadastra peca',
    method: 'POST',
    url: '{{baseUrl}}/parts',
    auth,
    headers: json,
    body: { code: 'OIL-FILTER-{{runId}}', name: 'Filtro de oleo', description: 'Filtro para oleo do motor', type: 'PART', unit: 'UNIT', unitPrice: 49.9, minimumQuantity: 3 },
    tests: ['test("peca criada", function () { expect(res.getStatus()).to.equal(201); });', ...captureId('partId')],
  },
  {
    sequence: 6,
    slug: 'entrada-estoque',
    name: 'Entrada no estoque',
    method: 'POST',
    url: '{{baseUrl}}/parts/{{partId}}/movements/in',
    auth,
    headers: json,
    body: { quantity: 10, idempotencyKey: 'entrada-{{runId}}' },
    tests: ['test("entrada registrada", function () { expect(res.getStatus()).to.equal(201); });', ...stopOnError],
  },
  {
    sequence: 7,
    slug: 'abre-ordem-servico',
    name: 'Abre ordem de servico',
    method: 'POST',
    url: '{{baseUrl}}/service-orders',
    auth,
    headers: json,
    body: { clientId: '{{clientId}}', vehicleId: '{{vehicleId}}', description: 'Barulho no motor ao acelerar' },
    tests: ['test("OS aberta", function () { expect(res.getStatus()).to.equal(201); });', ...captureId('serviceOrderId')],
  },
  {
    sequence: 8,
    slug: 'atribui-mecanico',
    name: 'Atribui mecanico',
    method: 'PATCH',
    url: '{{baseUrl}}/service-orders/{{serviceOrderId}}/assign',
    auth,
    headers: json,
    body: { mechanicId: '{{mechanicId}}' },
    tests: ['test("mecanico atribuido", function () { expect(res.getStatus()).to.equal(200); });', ...stopOnError],
  },
  {
    sequence: 9,
    slug: 'gera-orcamento',
    name: 'Gera orcamento',
    method: 'POST',
    url: '{{baseUrl}}/budgets',
    auth,
    headers: json,
    body: {
      serviceOrderId: '{{serviceOrderId}}',
      items: [
        { serviceId: '{{serviceId}}', description: 'Troca de oleo', type: 'SERVICE', quantity: 1, unitPrice: 149.9 },
        { partId: '{{partId}}', description: 'Filtro de oleo', type: 'PART', quantity: 1, unitPrice: 49.9 },
      ],
    },
    tests: [
      'test("orcamento criado com total esperado", function () {',
      '  expect(res.getStatus()).to.equal(201);',
      '  expect(res.getBody().totalAmount).to.equal(199.8);',
      '});',
      ...captureId('budgetId'),
    ],
  },
  {
    sequence: 10,
    slug: 'envia-orcamento-cliente',
    name: 'Envia orcamento ao cliente',
    method: 'POST',
    url: '{{baseUrl}}/budgets/{{budgetId}}/send',
    auth,
    tests: ['test("orcamento enviado", function () { expect(res.getStatus()).to.equal(200); });', ...stopOnError],
  },
  {
    sequence: 11,
    slug: 'aceita-orcamento',
    name: 'Aceita orcamento',
    method: 'POST',
    url: '{{baseUrl}}/budgets/{{budgetId}}/accept',
    auth,
    tests: ['test("orcamento aceito", function () { expect(res.getStatus()).to.equal(200); });', ...stopOnError],
  },
  {
    sequence: 12,
    slug: 'despacha-pecas-estoque',
    name: 'Despacha pecas do estoque',
    method: 'POST',
    url: '{{baseUrl}}/parts/service-orders/{{serviceOrderId}}/dispatch',
    auth,
    tests: [
      'test("pecas despachadas no smoke", function () {',
      '  expect(res.getStatus()).to.equal(200);',
      '  expect(res.getBody().dispatched).to.equal(true);',
      '});',
      ...stopOnError,
    ],
  },
  {
    sequence: 13,
    slug: 'finaliza-os',
    name: 'Finaliza OS',
    method: 'PATCH',
    url: '{{baseUrl}}/service-orders/{{serviceOrderId}}/complete',
    auth,
    tests: [
      'test("OS finalizada", function () {',
      '  expect(res.getStatus()).to.equal(200);',
      '  expect(res.getBody().status).to.equal("COMPLETED");',
      '});',
      ...stopOnError,
    ],
  },
  {
    sequence: 14,
    slug: 'gera-cobranca',
    name: 'Gera cobranca',
    method: 'POST',
    url: '{{baseUrl}}/billings',
    auth,
    headers: json,
    body: { serviceOrderId: '{{serviceOrderId}}' },
    tests: [
      'test("cobranca gerada", function () {',
      '  expect(res.getStatus()).to.equal(201);',
      '  expect(res.getBody().amount).to.equal(199.8);',
      '});',
      ...captureId('billingId'),
    ],
  },
  {
    sequence: 15,
    slug: 'entrega-os-opcional',
    name: 'Entrega OS opcional',
    method: 'POST',
    url: '{{baseUrl}}/billings/{{billingId}}/deliver-service-order',
    auth,
    tags: ['optional'],
    tests: [
      'test("entrega depende de pagamento", function () {',
      '  expect(res.getStatus()).to.be.oneOf([204, 409]);',
      '});',
      'if (res.getStatus() === 409) {',
      '  console.log("Pagamento ainda nao confirmado. Confirme webhook Stripe e rode npm run bruno:smoke:optional-delivery.");',
      '}',
    ],
  },
];

export const collection: SmokeCollection = {
  name: 'Oficina FIAP - Smoke QA',
  folder: 'bruno/oficina-fiap-smoke',
  environmentName: 'local',
  steps,
};
```

- [ ] **Step 4: Rodar teste**

Run:

```bash
npm test -- --runTestsByPath tools/bruno-smoke/adapter.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/bruno-smoke/flow.ts tools/bruno-smoke/adapter.spec.ts
git commit -m "test: define bruno smoke flow in typescript"
```

---

### Task 4: Gerador da coleção Bruno

**Files:**
- Modify: `tools/bruno-smoke/adapter.ts`
- Create: `tools/bruno-smoke/generate.ts`
- Modify: `tools/bruno-smoke/adapter.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `collection`
- Produces: `generateCollection(collection: SmokeCollection): Promise<void>`

- [ ] **Step 1: Testar renderização da coleção**

Adicionar em `adapter.spec.ts`:

```ts
import { renderCollectionConfig, renderEnvironment } from './adapter';

it('renders collection config and local environment', () => {
  expect(renderCollectionConfig(collection)).toContain('"name": "Oficina FIAP - Smoke QA"');
  expect(renderCollectionConfig(collection)).toContain('"defaultEnvironment": "local"');

  expect(renderEnvironment()).toContain('baseUrl: http://localhost:3000/api/v1');
  expect(renderEnvironment()).toContain('email: {{process.env.ADMIN_EMAIL}}');
  expect(renderEnvironment()).toContain('password: {{process.env.ADMIN_PASSWORD}}');
});
```

- [ ] **Step 2: Rodar teste para confirmar falha**

Run:

```bash
npm test -- --runTestsByPath tools/bruno-smoke/adapter.spec.ts
```

Expected: FAIL porque funções novas ainda não existem.

- [ ] **Step 3: Adicionar funções em `adapter.ts`**

```ts
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { SmokeCollection, SmokeStep } from './types';

export function renderCollectionConfig(collection: SmokeCollection): string {
  return JSON.stringify(
    {
      version: '1',
      name: collection.name,
      type: 'collection',
      defaultEnvironment: collection.environmentName,
    },
    null,
    2,
  ) + '\n';
}

export function renderEnvironment(): string {
  return [
    'vars {',
    '  baseUrl: http://localhost:3000/api/v1',
    '  email: {{process.env.ADMIN_EMAIL}}',
    '  password: {{process.env.ADMIN_PASSWORD}}',
    '}',
    '',
  ].join('\n');
}

export async function generateCollection(collection: SmokeCollection): Promise<void> {
  await rm(collection.folder, { recursive: true, force: true });
  await mkdir(join(collection.folder, 'environments'), { recursive: true });

  await writeFile(join(collection.folder, 'bruno.json'), renderCollectionConfig(collection));
  await writeFile(join(collection.folder, 'environments', `${collection.environmentName}.bru`), renderEnvironment());

  for (const step of collection.steps) {
    const filePath = join(collection.folder, fileNameForStep(step));
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, renderRequest(step));
  }
}
```

Keep existing `renderRequest` and `fileNameForStep` in same file. Remove duplicate imports if TypeScript reports them.

- [ ] **Step 4: Criar `generate.ts`**

```ts
import { generateCollection } from './adapter';
import { collection } from './flow';

generateCollection(collection).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 5: Adicionar script no `package.json`**

Adicionar:

```json
{
  "bruno:generate": "ts-node tools/bruno-smoke/generate.ts"
}
```

- [ ] **Step 6: Rodar testes**

Run:

```bash
npm test -- --runTestsByPath tools/bruno-smoke/adapter.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Gerar coleção**

Run:

```bash
npm run bruno:generate
```

Expected: pasta `bruno/oficina-fiap-smoke` criada com `bruno.json`, `environments/local.bru` e 16 arquivos `.bru`.

- [ ] **Step 8: Commit**

```bash
git add tools/bruno-smoke package.json bruno/oficina-fiap-smoke
git commit -m "test: generate bruno smoke collection from typescript"
```

---

### Task 5: Bruno CLI e comandos de QA

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: coleção gerada em `bruno/oficina-fiap-smoke`
- Produces: comandos de QA externo

- [ ] **Step 1: Instalar Bruno CLI**

Run:

```bash
npm install --save-dev @usebruno/cli
```

- [ ] **Step 2: Adicionar scripts Bruno**

Adicionar:

```json
{
  "bruno:smoke": "npm run bruno:generate && bru run bruno/oficina-fiap-smoke --env local --bail --exclude-tags optional",
  "bruno:smoke:report": "npm run bruno:generate && bru run bruno/oficina-fiap-smoke --env local --bail --exclude-tags optional --reporter-html reports/bruno/oficina-smoke.html --reporter-json reports/bruno/oficina-smoke.json --reporter-junit reports/bruno/oficina-smoke.xml --reporter-skip-headers Authorization",
  "bruno:smoke:optional-delivery": "bru run bruno/oficina-fiap-smoke/15-entrega-os-opcional.bru --env local --reporter-html reports/bruno/oficina-delivery.html --reporter-skip-headers Authorization"
}
```

- [ ] **Step 3: Verificar CLI**

Run:

```bash
npx bru --version
```

Expected: imprime versão do Bruno CLI sem erro.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "test: add bruno qa cli commands"
```

---

### Task 6: Documentação de QA externo

**Files:**
- Create: `docs/bruno-smoke-qa.md`
- Create: `reports/bruno/.gitkeep`

**Interfaces:**
- Consumes: scripts Bruno e coleção gerada
- Produces: guia de execução para QA/professor

- [ ] **Step 1: Criar `reports/bruno/.gitkeep`**

Run:

```powershell
New-Item -ItemType Directory -Force reports/bruno
New-Item -ItemType File -Force reports/bruno/.gitkeep
```

- [ ] **Step 2: Criar documentação**

```markdown
# Bruno Smoke QA

Esta validação roda a API como caixa-preta usando Bruno. Ela não substitui `npm run test:e2e`; serve para QA externo, demonstração e evidência com relatório.

## Fonte da coleção

A coleção Bruno é gerada a partir de TypeScript:

- `tools/bruno-smoke/flow.ts`: fluxo smoke.
- `tools/bruno-smoke/adapter.ts`: renderização `.bru`.
- `bruno/oficina-fiap-smoke`: saída gerada.

Edite o TypeScript e rode:

```bash
npm run bruno:generate
```

## Pré-requisitos

- API rodando em `http://localhost:3000/api/v1`.
- Banco migrado.
- Admin criado por seed.
- `ADMIN_EMAIL` e `ADMIN_PASSWORD` disponíveis no shell.

## Executar smoke principal

```bash
npm run bruno:smoke
```

## Gerar relatório

```bash
npm run bruno:smoke:report
```

Arquivos gerados:

- `reports/bruno/oficina-smoke.html`
- `reports/bruno/oficina-smoke.json`
- `reports/bruno/oficina-smoke.xml`

## Validar entrega paga opcional

O smoke principal para em cobrança gerada. A entrega depende de pagamento confirmado.

```bash
stripe listen --forward-to localhost:3000/api/v1/billings/stripe/webhook
stripe trigger checkout.session.completed
npm run bruno:smoke:optional-delivery
```

## O que Bruno não cobre

- Falta de estoque.
- Orçamento recusado.
- Cancelamento de OS.
- Rotas removidas.
- Métricas internas.
- Detalhes de políticas entre agregados.

Esses cenários pertencem à suíte Jest E2E em `test/workshop-flow.e2e-spec.ts`.
```

- [ ] **Step 3: Verificar documentação**

Run:

```bash
git diff --check -- docs/bruno-smoke-qa.md
```

Expected: sem erro de whitespace.

- [ ] **Step 4: Commit**

```bash
git add docs/bruno-smoke-qa.md reports/bruno/.gitkeep
git commit -m "docs: explain bruno smoke qa adapter"
```

---

### Task 7: Verificação final

**Files:**
- Read: `tools/bruno-smoke`
- Read: `bruno/oficina-fiap-smoke`
- Read: `docs/bruno-smoke-qa.md`
- Read: `package.json`

**Interfaces:**
- Consumes: adapter TS e coleção gerada
- Produces: evidência de que smoke externo roda sem substituir Jest

- [ ] **Step 1: Verificar diff**

Run:

```bash
git diff --check
```

Expected: sem erro.

- [ ] **Step 2: Rodar testes do adapter**

Run:

```bash
npm test -- --runTestsByPath tools/bruno-smoke/adapter.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Rodar geração**

Run:

```bash
npm run bruno:generate
```

Expected: coleção Bruno gerada em `bruno/oficina-fiap-smoke`.

- [ ] **Step 4: Rodar build da API**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Rodar suíte E2E oficial**

Run:

```bash
npm run test:e2e
```

Expected: PASS. Se ambiente local não tiver banco ou dependências, registrar erro exato no handoff.

- [ ] **Step 6: Rodar smoke Bruno principal**

Run:

```bash
npm run bruno:smoke:report
```

Expected: requests 00-14 PASS e relatórios criados.

- [ ] **Step 7: Conferir relatórios**

Run:

```powershell
Get-ChildItem reports/bruno
```

Expected:

```text
oficina-smoke.html
oficina-smoke.json
oficina-smoke.xml
```

- [ ] **Step 8: Commit final se houver ajustes**

```bash
git add package.json package-lock.json tools/bruno-smoke bruno/oficina-fiap-smoke docs/bruno-smoke-qa.md reports/bruno/.gitkeep
git commit -m "test: add bruno smoke qa adapter"
```

---

## Bruno Smoke Request Map

| Step | Name | Purpose | Required in smoke |
| --- | --- | --- | --- |
| 00 | Health check | API está no ar e gera dados únicos | Yes |
| 01 | Login | Auth real e token bearer | Yes |
| 02 | Cria cliente | Escrita básica de cliente | Yes |
| 03 | Cadastra veículo | Escrita básica de veículo | Yes |
| 04 | Cadastra serviço | Catálogo disponível | Yes |
| 05 | Cadastra peça | Estoque disponível | Yes |
| 06 | Entrada estoque | Garante saldo para fluxo feliz | Yes |
| 07 | Abre OS | Inicia atendimento | Yes |
| 08 | Atribui mecânico | Passa por diagnóstico | Yes |
| 09 | Gera orçamento | Soma serviço + peça | Yes |
| 10 | Envia orçamento | Avança proposta | Yes |
| 11 | Aceita orçamento | Cliente aprova | Yes |
| 12 | Despacha peças | Confirma caminho com saldo | Yes |
| 13 | Finaliza OS | Conclui execução | Yes |
| 14 | Gera cobrança | Produz cobrança e relatório final do smoke | Yes |
| 15 | Entrega OS | Depende de pagamento/webhook | Optional |

---

## Non-Goals

- Reimplementar `test/workshop-flow.e2e-spec.ts` no Bruno.
- Cobrir cenários negativos.
- Testar regras de domínio em profundidade.
- Substituir Jest E2E no CI.
- Criar mocks para Stripe dentro do Bruno.
- Manter `.bru` como fonte primária editável.

---

## Self-Review

- Spec coverage: Postman usado como mapa do fluxo, reduzido para smoke externo.
- TypeScript base: adapter, tipos, flow e generator definidos em `tools/bruno-smoke`.
- Redundância removida: cenários complexos e negativos ficam no Jest E2E.
- Bruno automation: coberta com `bru run`, `--env local`, `--bail`, `--exclude-tags optional`, HTML/JSON/JUnit reporters.
- Dynamic data: CPF válido, placa Mercosul, e-mail único e mechanic UUID determinístico cobertos sem biblioteca externa.
- Auth: login captura bearer token; requests protegidos usam `Authorization: Bearer {{accessToken}}`.
- Stripe caveat: entrega fica opcional, fora do smoke principal.
- Placeholder scan: no empty implementation markers, no incomplete task.

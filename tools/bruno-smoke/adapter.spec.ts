import { describe, expect, it } from '@jest/globals';
import {
  renderCollectionConfig,
  renderEnvironment,
  renderRequest,
} from './adapter';
import { collection } from './flow';
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
      tests: [
        'test("cliente criado", function () { expect(res.getStatus()).to.equal(201); });',
      ],
    };

    const output = renderRequest(step);

    expect(output).toContain('tags: [');
    expect(output).toContain('    smoke');
    expect(output).toContain('Authorization: Bearer {{accessToken}}');
    expect(output).toContain('body: json');
    expect(output).toContain('"email": "{{clientEmail}}"');
    expect(output).toContain('script:pre-request {');
    expect(output).toContain('tests {');
  });

  it('keeps Bruno smoke focused on the happy path plus optional delivery', () => {
    expect(collection.name).toBe('Oficina FIAP - Smoke QA');
    expect(collection.steps).toHaveLength(17);
    expect(
      collection.steps.filter((step) => step.tags?.includes('optional')),
    ).toHaveLength(1);
    expect(collection.steps[0].slug).toBe('gerar-dados');
    expect(collection.steps[1].slug).toBe('health-check');
    expect(collection.steps[15].slug).toBe('gera-cobranca');
    expect(collection.steps[16].slug).toBe('entrega-os-opcional');
  });

  it('renders collection config and local environment', () => {
    expect(renderCollectionConfig(collection)).toContain(
      '"name": "Oficina FIAP - Smoke QA"',
    );
    expect(renderCollectionConfig(collection)).toContain(
      '"defaultEnvironment": "local"',
    );

    expect(renderEnvironment()).toContain(
      'baseUrl: http://localhost:3000/api/v1',
    );
    expect(renderEnvironment()).toContain(
      'email: {{process.env.ADMIN_EMAIL}}',
    );
    expect(renderEnvironment()).toContain(
      'password: {{process.env.ADMIN_PASSWORD}}',
    );
    expect(renderEnvironment()).toContain('useRandomData: true');
    expect(renderEnvironment()).toContain('document: 11222333000181');
  });
});

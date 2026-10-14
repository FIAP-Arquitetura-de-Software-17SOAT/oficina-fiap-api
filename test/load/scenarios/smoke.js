// Sanidade da suíte e do ambiente: 1 VU, 1 iteração, jornada completa e uma
// leitura de cada listagem. Rode antes de qualquer cenário de carga.
import { check, group } from 'k6';
import http from 'k6/http';
import { MAILPIT_URL } from '../lib/config.js';
import { api, expectStatus, health } from '../lib/api.js';
import { adminToken, catalog } from '../lib/fixtures.js';
import { serviceOrderJourney } from '../lib/journey.js';

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ['rate==1'],
    http_req_failed: ['rate==0'],
  },
};

const LISTS = [
  '/service-orders',
  '/service-orders/metrics/average-execution-time',
  '/budgets',
  '/clients',
  '/vehicles',
  '/parts',
  '/services',
  '/billings',
  '/notifications',
  '/purchase-orders',
];

export function setup() {
  expectStatus(health(), 200, 'health');
  const token = adminToken();
  return { token, catalog: catalog(api(token), { parts: 1, stockPerPart: 10 }) };
}

export default function ({ token, catalog: catalogData }) {
  const a = api(token);

  serviceOrderJourney(a, catalogData, { pause: 0 });

  group('listagens', () => {
    for (const path of LISTS) {
      expectStatus(a.list(path), 200, `GET ${path}`);
    }
  });

  group('e-mails no Mailpit', () => {
    const res = http.get(`${MAILPIT_URL}/api/v1/messages?limit=1`, { tags: { name: 'mailpit' } });
    check(res, {
      'Mailpit recebeu e-mails da API': (r) => r.status === 200 && r.json('total') > 0,
    });
  });
}

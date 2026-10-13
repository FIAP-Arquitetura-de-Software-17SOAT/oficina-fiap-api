// Jornada completa da OS sob carga. Perfis (PROFILE):
//   smoke  1 VU, 1 iteração
//   load   rampa 0→20 VUs (2 min), 20 VUs por 5 min, rampa de descida (1 min)
//   soak   10 VUs constantes por 45 min — rode junto com watch-resources.sh
import { api } from '../lib/api.js';
import { baseThresholds, pickProfile } from '../lib/config.js';
import { adminApi, adminToken, catalog } from '../lib/fixtures.js';
import { serviceOrderJourney } from '../lib/journey.js';

const profiles = {
  smoke: { executor: 'per-vu-iterations', vus: 1, iterations: 1 },
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m', target: 20 },
      { duration: '5m', target: 20 },
      { duration: '1m', target: 0 },
    ],
  },
  soak: { executor: 'constant-vus', vus: 10, duration: '45m' },
};

// Baseline inicial; ajuste após a primeira medição e registre no README.
const WRITE_P95 = 'p(95)<500';
const READ_P95 = 'p(95)<300';

export const options = {
  scenarios: { journey: pickProfile(profiles) },
  setupTimeout: '2m',
  thresholds: {
    ...baseThresholds,
    'http_req_duration{name:/service-orders}': [WRITE_P95],
    'http_req_duration{name:/service-orders/:id/assign}': [WRITE_P95],
    'http_req_duration{name:/budgets}': [WRITE_P95],
    'http_req_duration{name:/budgets/:id/send}': [WRITE_P95],
    'http_req_duration{name:/budgets/:id/accept}': [WRITE_P95],
    'http_req_duration{name:/parts/service-orders/:id/dispatch}': [WRITE_P95],
    'http_req_duration{name:/service-orders/:id/complete}': [WRITE_P95],
    'http_req_duration{name:/billings}': [WRITE_P95],
    'http_req_duration{name:/billings/stripe/webhook}': [WRITE_P95],
    'http_req_duration{name:/billings/:id/deliver-service-order}': [WRITE_P95],
    'http_req_duration{name:/service-orders/:id}': [READ_P95],
  },
};

export function setup() {
  const token = adminToken();
  return { token, catalog: catalog(api(token)) };
}

export default function ({ catalog: catalogData }) {
  serviceOrderJourney(adminApi(), catalogData, { pause: 1 });
}

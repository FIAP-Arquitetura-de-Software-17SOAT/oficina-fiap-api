// Leitura no ritmo de um painel da oficina, contra o volume semeado pelo
// seed-volume. Nenhuma listagem tem paginação e a métrica de tempo médio
// carrega todas as OSs concluídas: compare p95/p99 e data_received entre
// volumes para ver o que cresce com os dados.
//   RATE      requisições por segundo (padrão 30)
//   DURATION  duração (padrão 3m)
import { check } from 'k6';
import exec from 'k6/execution';
import { api } from '../lib/api.js';
import { adminToken } from '../lib/fixtures.js';

const PATHS = [
  '/service-orders',
  '/service-orders/metrics/average-execution-time',
  '/budgets',
  '/clients',
  '/vehicles',
  '/parts',
  '/services',
  '/billings',
  '/notifications',
];

const thresholds = { http_req_failed: ['rate<0.01'] };
// Um threshold por rota faz o resumo do k6 mostrar a latência de cada uma.
for (const path of PATHS) thresholds[`http_req_duration{name:${path}}`] = ['p(95)<1000'];

export const options = {
  scenarios: {
    dashboard: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RATE || 30),
      timeUnit: '1s',
      duration: __ENV.DURATION || '3m',
      preAllocatedVUs: 30,
      maxVUs: 200,
    },
  },
  thresholds,
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  return { token: adminToken() };
}

export default function ({ token }) {
  const path = PATHS[exec.scenario.iterationInTest % PATHS.length];
  check(api(token).list(path), { [`GET ${path} -> 200`]: (r) => r.status === 200 });
}

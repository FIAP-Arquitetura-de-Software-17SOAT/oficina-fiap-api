// Área do cliente (papel CUSTOMER) sob carga, com checagem de isolamento:
// a cada iteração o cliente também tenta ler a OS e o orçamento de outro
// cliente, e a API deve responder 404 (escopo por clientId).
//   CUSTOMERS  clientes preparados no setup (padrão 20)
//   PROFILE    smoke (1 VU, 3 iterações) ou load (20 VUs por 3 min)
import { check, sleep } from 'k6';
import { api, expectStatus, loginOrFail } from '../lib/api.js';
import { baseThresholds, pickProfile } from '../lib/config.js';
import {
  adminToken,
  catalog,
  customerAccount,
  pickCatalog,
  sentBudget,
  serviceOrderInDiagnosis,
} from '../lib/fixtures.js';
import { violationCounter } from '../lib/race.js';

const CUSTOMERS = Number(__ENV.CUSTOMERS || 20);

const scopeLeak = violationCounter('customer_scope_leak');

const profiles = {
  smoke: { executor: 'per-vu-iterations', vus: 1, iterations: 3 },
  load: { executor: 'constant-vus', vus: 20, duration: '3m' },
};

export const options = {
  scenarios: { customers: pickProfile(profiles) },
  setupTimeout: '10m',
  thresholds: {
    ...baseThresholds,
    customer_scope_leak: ['count==0'],
    'http_req_duration{name:/service-orders/mine}': ['p(95)<300'],
    'http_req_duration{name:/service-orders/:id}': ['p(95)<300'],
    'http_req_duration{name:/budgets?serviceOrderId}': ['p(95)<300'],
  },
};

export function setup() {
  const admin = api(adminToken());
  const catalogData = catalog(admin, { parts: 1 });
  return {
    customers: Array.from({ length: CUSTOMERS }, () => {
      const account = customerAccount(admin);
      const order = serviceOrderInDiagnosis(admin, account);
      const budget = sentBudget(admin, order.id, pickCatalog(catalogData));
      const { accessToken } = loginOrFail(account.email, account.password);
      return { token: accessToken, orderId: order.id, budgetId: budget.id };
    }),
  };
}

export default function ({ customers }) {
  const index = (__VU - 1) % customers.length;
  const me = customers[index];
  const other = customers[(index + 1) % customers.length];
  const a = api(me.token);

  const mine = expectStatus(a.myServiceOrders(), 200, 'minhas OSs');
  check(mine, { 'lista só OSs próprias': (list) => list.every((o) => o.id !== other.orderId) });
  expectStatus(a.getServiceOrder(me.orderId), 200, 'minha OS');
  expectStatus(a.listBudgets(me.orderId), 200, 'meus orçamentos');

  // Primeira iteração do VU decide o orçamento próprio; VUs que dividem o
  // mesmo cliente podem receber 409, que não é erro.
  if (__ITER === 0) {
    check(a.acceptBudget(me.budgetId, [200, 409]), {
      'aceite próprio -> 200/409': (r) => r.status === 200 || r.status === 409,
    });
  }

  if (other.orderId !== me.orderId) {
    const foreignOrder = a.getServiceOrder(other.orderId, [404]);
    const foreignBudget = a.getBudget(other.budgetId, [404]);
    scopeLeak.record(foreignOrder.status !== 404 || foreignBudget.status !== 404, {
      orderStatus: foreignOrder.status,
      budgetStatus: foreignBudget.status,
    });
    check(foreignOrder, { 'OS de outro cliente -> 404': (r) => r.status === 404 });
  }
  sleep(0.5);
}

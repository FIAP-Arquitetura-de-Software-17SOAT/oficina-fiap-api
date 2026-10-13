// Capacidade da autenticação. O login compara bcrypt com custo 12, que é
// CPU-bound e roda no pool do libuv (4 threads por padrão): é o limite de
// logins/s por pod. Perfis (PROFILE):
//   smoke   1 VU, 3 iterações
//   stress  chegada crescente de 5 a 100 logins/s; procure o ponto em que
//           a latência explode ou os erros passam de 5%
//   spike   0 → 80 logins/s em 10 s, 1 min de pico, volta a 0
import { check, sleep } from 'k6';
import { api, auth, expectStatus } from '../lib/api.js';
import { pickProfile } from '../lib/config.js';
import { adminToken, customerAccount } from '../lib/fixtures.js';

const ACCOUNTS = Number(__ENV.ACCOUNTS || 50);

const profiles = {
  smoke: { executor: 'per-vu-iterations', vus: 1, iterations: 3 },
  stress: {
    executor: 'ramping-arrival-rate',
    startRate: 5,
    timeUnit: '1s',
    preAllocatedVUs: 50,
    maxVUs: 400,
    stages: [
      { duration: '1m', target: 20 },
      { duration: '2m', target: 50 },
      { duration: '2m', target: 100 },
      { duration: '1m', target: 100 },
    ],
  },
  spike: {
    executor: 'ramping-arrival-rate',
    startRate: 0,
    timeUnit: '1s',
    preAllocatedVUs: 100,
    maxVUs: 400,
    stages: [
      { duration: '10s', target: 80 },
      { duration: '1m', target: 80 },
      { duration: '10s', target: 0 },
    ],
  },
};

export const options = {
  scenarios: { auth: pickProfile(profiles) },
  setupTimeout: '5m',
  thresholds: {
    // Sem abortar: no stress queremos ver onde quebra, não parar no primeiro erro.
    http_req_failed: ['rate<0.05'],
    'http_req_duration{name:/auth/login}': ['p(95)<2000'],
    'http_req_duration{name:/auth/refresh}': ['p(95)<1000'],
    'http_req_duration{name:/service-orders/mine}': ['p(95)<500'],
  },
};

export function setup() {
  const admin = api(adminToken());
  return {
    accounts: Array.from({ length: ACCOUNTS }, () => {
      const account = customerAccount(admin);
      return { email: account.email, password: account.password };
    }),
  };
}

export default function ({ accounts }) {
  const account = accounts[Math.floor(Math.random() * accounts.length)];
  const res = auth.login(account.email, account.password);
  if (!check(res, { 'login -> 200': (r) => r.status === 200 })) return;
  const tokens = res.json();

  const customer = api(tokens.accessToken);
  for (let i = 0; i < 3; i++) {
    check(customer.myServiceOrders(), { 'minhas OSs -> 200': (r) => r.status === 200 });
  }

  const refreshed = expectStatus(auth.refresh(tokens.refreshToken), 201, 'refresh');
  check(auth.logout(refreshed.refreshToken), { 'logout -> 204': (r) => r.status === 204 });
  sleep(0.1);
}

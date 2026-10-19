// Webhook do Stripe (rota pública, assinatura verificada pelo SDK oficial).
// O k6 assina os eventos com o segredo de teste; nada vai ao Stripe real.
//   duplicates  o mesmo evento entregue 5x em paralelo (o Stripe reenvia):
//               a cobrança fica PAID, sem 5xx
//   invalid     assinatura inválida a 50 req/s por 1 min: tudo rejeitado com 400
//   burst       rajada de eventos válidos de cobranças diferentes
// DUPLICATES e BURST controlam quantas cobranças o setup prepara.
import { check } from 'k6';
import exec from 'k6/execution';
import http from 'k6/http';
import { api, expectStatus } from '../lib/api.js';
import { adminToken, billingAwaitingPayment, catalog } from '../lib/fixtures.js';
import { countStatuses, violationCounter } from '../lib/race.js';
import { paidCheckoutEvent, webhookRequest } from '../lib/stripe.js';

const DUPLICATES = Number(__ENV.DUPLICATES || 10);
const BURST = Number(__ENV.BURST || 50);
const COPIES = 5;

const doublePayment = violationCounter('payment_double_registration');
const acceptedForgery = violationCounter('webhook_forgery_accepted');

export const options = {
  setupTimeout: '15m',
  scenarios: {
    duplicates: {
      executor: 'per-vu-iterations',
      exec: 'duplicates',
      vus: 1,
      iterations: DUPLICATES,
    },
    invalid: {
      executor: 'constant-arrival-rate',
      exec: 'invalidSignature',
      rate: 50,
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 20,
      maxVUs: 100,
      startTime: '5s',
    },
    burst: {
      executor: 'shared-iterations',
      exec: 'burst',
      vus: Math.min(BURST, 50),
      iterations: BURST,
      startTime: '1m10s',
    },
  },
  thresholds: {
    checks: ['rate==1'],
    payment_double_registration: ['count==0'],
    webhook_forgery_accepted: ['count==0'],
    'http_req_duration{name:/billings/stripe/webhook}': ['p(95)<500'],
  },
};

export function setup() {
  const token = adminToken();
  const a = api(token);
  const catalogData = catalog(a);
  const billings = (n) => Array.from({ length: n }, () => billingAwaitingPayment(a, catalogData).billing);
  return { token, duplicates: billings(DUPLICATES), burst: billings(BURST) };
}

export function duplicates({ token, duplicates: billings }) {
  const billing = billings[exec.scenario.iterationInTest];
  const event = paidCheckoutEvent(billing.gatewayTransactionId);
  const responses = http.batch(
    Array.from({ length: COPIES }, () => webhookRequest(event, http.expectedStatuses(204, 409))),
  );
  const statuses = countStatuses(responses);
  const final = expectStatus(api(token).getBilling(billing.id), 200, 'consultar cobrança');

  const serverErrors = responses.filter((r) => r.status >= 500).length;
  doublePayment.record(final.status !== 'PAID' || serverErrors > 0 || !statuses[204], {
    billingId: billing.id,
    statuses,
    billingStatus: final.status,
  });
  check(final, { 'cobrança paga uma vez': (b) => b.status === 'PAID' });
}

export function invalidSignature() {
  const event = paidCheckoutEvent('cs_test_forged', { secret: 'whsec_wrong' });
  const req = webhookRequest(event, http.expectedStatuses(400));
  const res = http.request(req.method, req.url, req.body, req.params);
  acceptedForgery.record(res.status !== 400, { status: res.status });
  check(res, { 'assinatura inválida -> 400': (r) => r.status === 400 });
}

export function burst({ burst: billings }) {
  const billing = billings[exec.scenario.iterationInTest];
  const req = webhookRequest(paidCheckoutEvent(billing.gatewayTransactionId));
  const res = http.request(req.method, req.url, req.body, req.params);
  check(res, { 'evento válido -> 204': (r) => r.status === 204 });
}

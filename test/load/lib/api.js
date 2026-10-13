import http from 'k6/http';
import { check, fail } from 'k6';
import { API, BASE_URL } from './config.js';

/**
 * Parâmetros de uma requisição. `name` agrupa as métricas pela rota (sem ids
 * na URL); `expected` lista os status que não contam como falha em
 * `http_req_failed` — os cenários de corrida esperam 409 de propósito.
 */
function params(token, name, expected) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const result = { headers, tags: { name } };
  if (expected) result.responseCallback = http.expectedStatuses(...expected);
  return result;
}

function body(payload) {
  return payload === undefined ? null : JSON.stringify(payload);
}

export function request(method, path, payload, { token, name, expected } = {}) {
  return http.request(method, `${API}${path}`, body(payload), params(token, name ?? path, expected));
}

/** Requisição no formato de `http.batch`, para disparos simultâneos. */
export function batchItem(method, path, payload, { token, name, expected } = {}) {
  return {
    method,
    url: `${API}${path}`,
    body: body(payload),
    params: params(token, name ?? path, expected),
  };
}

/**
 * Confere o status e devolve o corpo JSON. Fora do status esperado, registra
 * o check e aborta a iteração (`fail`): as etapas seguintes dependem desta.
 */
export function expectStatus(res, status, label) {
  const ok = check(res, { [`${label} -> ${status}`]: (r) => r.status === status });
  if (!ok) {
    fail(`${label}: esperado ${status}, recebido ${res.status} ${String(res.body).slice(0, 300)}`);
  }
  return res.body ? res.json() : null;
}

export function health() {
  return http.get(`${BASE_URL}/health`, { tags: { name: '/health' } });
}

export const auth = {
  login: (email, password, opts = {}) =>
    request('POST', '/auth/login', { email, password }, { name: '/auth/login', ...opts }),
  refresh: (refreshToken, opts = {}) =>
    request('POST', '/auth/refresh', { refreshToken }, { name: '/auth/refresh', ...opts }),
  logout: (refreshToken, opts = {}) =>
    request('POST', '/auth/logout', { refreshToken }, { name: '/auth/logout', ...opts }),
};

export function loginOrFail(email, password) {
  return expectStatus(auth.login(email, password), 200, 'login');
}

/** Rotas autenticadas, ligadas a um access token. */
export function api(token) {
  const call = (method, path, payload, name, expected) =>
    request(method, path, payload, { token, name, expected });

  return {
    createClient: (data) => call('POST', '/clients', data, '/clients'),
    createClientAccount: (clientId, password) =>
      call('POST', `/clients/${clientId}/account`, { password }, '/clients/:id/account'),
    createVehicle: (data) => call('POST', '/vehicles', data, '/vehicles'),
    createService: (data) => call('POST', '/services', data, '/services'),
    createPart: (data) => call('POST', '/parts', data, '/parts'),
    getPart: (id) => call('GET', `/parts/${id}`, undefined, '/parts/:id'),
    stockIn: (id, quantity, idempotencyKey) =>
      call('POST', `/parts/${id}/movements/in`, { quantity, idempotencyKey }, '/parts/:id/movements/in'),
    stockOut: (id, quantity, idempotencyKey, expected) =>
      call('POST', `/parts/${id}/movements/out`, { quantity, idempotencyKey }, '/parts/:id/movements/out', expected),

    openServiceOrder: (data) => call('POST', '/service-orders', data, '/service-orders'),
    getServiceOrder: (id, expected) =>
      call('GET', `/service-orders/${id}`, undefined, '/service-orders/:id', expected),
    myServiceOrders: () => call('GET', '/service-orders/mine', undefined, '/service-orders/mine'),
    assign: (id, mechanicId, expected) =>
      call('PATCH', `/service-orders/${id}/assign`, { mechanicId }, '/service-orders/:id/assign', expected),
    complete: (id) => call('PATCH', `/service-orders/${id}/complete`, undefined, '/service-orders/:id/complete'),

    createBudget: (data) => call('POST', '/budgets', data, '/budgets'),
    getBudget: (id, expected) => call('GET', `/budgets/${id}`, undefined, '/budgets/:id', expected),
    listBudgets: (serviceOrderId) =>
      call('GET', `/budgets?serviceOrderId=${serviceOrderId}`, undefined, '/budgets?serviceOrderId'),
    sendBudget: (id) => call('POST', `/budgets/${id}/send`, undefined, '/budgets/:id/send'),
    acceptBudget: (id, expected) =>
      call('POST', `/budgets/${id}/accept`, undefined, '/budgets/:id/accept', expected),
    refuseBudget: (id, reason, expected) =>
      call('POST', `/budgets/${id}/refuse`, { reason }, '/budgets/:id/refuse', expected),

    dispatchParts: (serviceOrderId) =>
      call('POST', `/parts/service-orders/${serviceOrderId}/dispatch`, undefined, '/parts/service-orders/:id/dispatch'),

    generateBilling: (serviceOrderId) => call('POST', '/billings', { serviceOrderId }, '/billings'),
    getBilling: (id) => call('GET', `/billings/${id}`, undefined, '/billings/:id'),
    deliverBilled: (id) =>
      call('POST', `/billings/${id}/deliver-service-order`, undefined, '/billings/:id/deliver-service-order'),

    list: (path) => call('GET', path, undefined, path),
  };
}

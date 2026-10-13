import { API, adminCredentials } from './config.js';
import { api, expectStatus, loginOrFail } from './api.js';
import { cpf, email, phone, plate, uniq, uuid } from './data.js';
import { paidCheckoutEvent } from './stripe.js';
import http from 'k6/http';

export const CUSTOMER_PASSWORD = 'load-test-password';
const PART_PRICE = 149.9;
const SERVICE_PRICE = 89.9;

/** Login do administrador criado pelo seed do Compose. */
export function adminToken() {
  const { email: adminEmail, password } = adminCredentials();
  return loginOrFail(adminEmail, password).accessToken;
}

/** Peça com saldo inicial (entrada idempotente). */
export function partWithStock(a, quantity) {
  const part = expectStatus(
    a.createPart({
      code: `LOAD-${uniq()}`,
      name: 'Filtro de óleo (carga)',
      type: 'PART',
      unit: 'UNIT',
      unitPrice: PART_PRICE,
      minimumQuantity: 1,
    }),
    201,
    'criar peça',
  );
  if (quantity > 0) {
    expectStatus(a.stockIn(part.id, quantity, `seed-${part.id}`), 201, 'entrada de estoque');
  }
  return part;
}

export function catalogService(a) {
  return expectStatus(
    a.createService({ name: `Troca de óleo ${uniq()}`, price: SERVICE_PRICE }),
    201,
    'criar serviço',
  );
}

/** Peças e serviços compartilhados pelas iterações de um cenário. */
export function catalog(a, { parts = 5, stockPerPart = 100000 } = {}) {
  return {
    partIds: Array.from({ length: parts }, () => partWithStock(a, stockPerPart).id),
    serviceId: catalogService(a).id,
  };
}

export function customerWithVehicle(a) {
  const client = expectStatus(
    a.createClient({ name: 'Cliente Carga', document: cpf(), email: email('cliente'), phone: phone() }),
    201,
    'criar cliente',
  );
  const vehicle = expectStatus(
    a.createVehicle({ clientId: client.id, plate: plate(), brand: 'Fiat', model: 'Argo', year: 2022 }),
    201,
    'criar veículo',
  );
  return { client, vehicle };
}

/** Cliente com login próprio (papel CUSTOMER). */
export function customerAccount(a) {
  const { client, vehicle } = customerWithVehicle(a);
  expectStatus(a.createClientAccount(client.id, CUSTOMER_PASSWORD), 201, 'criar conta do cliente');
  return { client, vehicle, email: client.email, password: CUSTOMER_PASSWORD };
}

export function openServiceOrder(a, { client, vehicle }) {
  return expectStatus(
    a.openServiceOrder({ clientId: client.id, vehicleId: vehicle.id, description: 'Barulho no motor (carga)' }),
    201,
    'abrir OS',
  );
}

/** OS em diagnóstico: aberta e atribuída a um mecânico novo. */
export function serviceOrderInDiagnosis(a, owner) {
  const order = openServiceOrder(a, owner);
  expectStatus(a.assign(order.id, uuid()), 200, 'atribuir mecânico');
  return order;
}

/** Orçamento com uma peça e um serviço, enviado ao cliente (AWAITING_APPROVAL). */
export function sentBudget(a, serviceOrderId, { partId, serviceId }) {
  const budget = expectStatus(
    a.createBudget({
      serviceOrderId,
      items: [
        { partId, description: 'Filtro de óleo', type: 'PART', quantity: 1, unitPrice: PART_PRICE },
        { serviceId, description: 'Troca de óleo', type: 'SERVICE', quantity: 1, unitPrice: SERVICE_PRICE },
      ],
    }),
    201,
    'criar orçamento',
  );
  expectStatus(a.sendBudget(budget.id), 200, 'enviar orçamento');
  return budget;
}

/** OS concluída com cobrança aguardando pagamento. */
export function billingAwaitingPayment(a, catalogData) {
  const owner = customerWithVehicle(a);
  const order = serviceOrderInDiagnosis(a, owner);
  const budget = sentBudget(a, order.id, pickCatalog(catalogData));
  expectStatus(a.acceptBudget(budget.id), 200, 'aceitar orçamento');
  expectStatus(a.dispatchParts(order.id), 200, 'baixar peças');
  expectStatus(a.complete(order.id), 200, 'concluir OS');
  const billing = expectStatus(a.generateBilling(order.id), 201, 'gerar cobrança');
  return { order, billing };
}

export function payBilling(billing) {
  const event = paidCheckoutEvent(billing.gatewayTransactionId);
  const res = http.post(`${API}/billings/stripe/webhook`, event.payload, {
    headers: { 'Content-Type': 'application/json', 'stripe-signature': event.signature },
    tags: { name: '/billings/stripe/webhook' },
  });
  expectStatus(res, 204, 'webhook de pagamento');
}

export function pickCatalog({ partIds, serviceId }) {
  return { partId: partIds[Math.floor(Math.random() * partIds.length)], serviceId };
}

export { api };

// Invariantes da saída de estoque sob concorrência:
// 1. saldo nunca negativo: com saldo 10, 30 saídas simultâneas de 1 unidade
//    resultam em exatamente 10 aceitas e saldo final 0;
// 2. idempotência: a mesma idempotencyKey repetida em paralelo baixa uma vez.
import { check, group } from 'k6';
import http from 'k6/http';
import { api, batchItem, expectStatus } from '../lib/api.js';
import { uuid } from '../lib/data.js';
import { adminToken, partWithStock } from '../lib/fixtures.js';
import { countStatuses, raceOptions, violationCounter } from '../lib/race.js';

const INITIAL_STOCK = 10;
const CONCURRENT_OUTS = 30;
const REPLAYS = 10;

const oversell = violationCounter('stock_oversell');
const idempotency = violationCounter('stock_idempotency_violation');

export const options = raceOptions(['stock_oversell', 'stock_idempotency_violation']);

export function setup() {
  return { token: adminToken() };
}

function stockOut(token, partId, idempotencyKey) {
  return batchItem(
    'POST',
    `/parts/${partId}/movements/out`,
    { quantity: 1, idempotencyKey },
    { token, name: '/parts/:id/movements/out', expected: [201, 409] },
  );
}

export default function ({ token }) {
  const a = api(token);

  group('saídas concorrentes contra saldo limitado', () => {
    const part = partWithStock(a, INITIAL_STOCK);
    const responses = http.batch(
      Array.from({ length: CONCURRENT_OUTS }, () => stockOut(token, part.id, uuid())),
    );
    const statuses = countStatuses(responses);
    const final = expectStatus(a.getPart(part.id), 200, 'consultar peça');

    const violated =
      statuses[201] !== INITIAL_STOCK ||
      statuses[409] !== CONCURRENT_OUTS - INITIAL_STOCK ||
      final.quantity !== 0;
    oversell.record(violated, { partId: part.id, statuses, finalQuantity: final.quantity });
    check(final, { 'saldo final 0 e nunca negativo': (p) => p.quantity === 0 });
  });

  group('mesma idempotencyKey em paralelo', () => {
    const part = partWithStock(a, INITIAL_STOCK);
    const key = uuid();
    const responses = http.batch(
      Array.from({ length: REPLAYS }, () => stockOut(token, part.id, key)),
    );
    const statuses = countStatuses(responses);
    const ids = new Set(responses.filter((r) => r.status === 201).map((r) => r.json('id')));
    const final = expectStatus(a.getPart(part.id), 200, 'consultar peça');

    const violated = statuses[201] !== REPLAYS || ids.size !== 1 || final.quantity !== INITIAL_STOCK - 1;
    idempotency.record(violated, { partId: part.id, statuses, distinctMovements: ids.size, finalQuantity: final.quantity });
    check(final, { 'baixou uma única vez': (p) => p.quantity === INITIAL_STOCK - 1 });
  });
}

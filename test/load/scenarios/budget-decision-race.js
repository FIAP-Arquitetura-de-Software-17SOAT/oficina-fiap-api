// Decisão do orçamento sob concorrência (controle otimista por updatedAt):
// aceite e recusa simultâneos devem gravar exatamente uma decisão, e o estado
// da OS deve seguir a decisão que venceu.
import { check, group } from 'k6';
import http from 'k6/http';
import { api, batchItem, expectStatus } from '../lib/api.js';
import {
  adminToken,
  catalog,
  customerWithVehicle,
  pickCatalog,
  sentBudget,
  serviceOrderInDiagnosis,
} from '../lib/fixtures.js';
import { countStatuses, raceOptions, violationCounter } from '../lib/race.js';

const doubleDecision = violationCounter('budget_double_decision');

export const options = raceOptions(['budget_double_decision']);

export function setup() {
  const token = adminToken();
  return { token, catalog: catalog(api(token), { parts: 1 }) };
}

export default function ({ token, catalog: catalogData }) {
  const a = api(token);

  group('aceite e recusa simultâneos', () => {
    const order = serviceOrderInDiagnosis(a, customerWithVehicle(a));
    const budget = sentBudget(a, order.id, pickCatalog(catalogData));
    const decision = (action, payload) =>
      batchItem('POST', `/budgets/${budget.id}/${action}`, payload, {
        token,
        name: `/budgets/:id/${action}`,
        expected: [200, 400, 409],
      });

    const responses = http.batch([
      decision('accept'),
      decision('refuse', { reason: 'Recusa concorrente (carga)' }),
      decision('accept'),
      decision('refuse', { reason: 'Recusa concorrente (carga)' }),
    ]);
    const statuses = countStatuses(responses);
    const final = expectStatus(a.getBudget(budget.id), 200, 'consultar orçamento');
    const orderNow = expectStatus(a.getServiceOrder(order.id), 200, 'consultar OS');

    const winners = responses.filter((r) => r.status === 200).map((r) => r.json('status'));
    const consistentOrder =
      (final.status === 'ACCEPTED' && orderNow.status === 'AWAITING_PARTS') ||
      (final.status === 'REFUSED' && orderNow.status !== 'AWAITING_PARTS');

    doubleDecision.record(winners.length !== 1 || winners[0] !== final.status || !consistentOrder, {
      budgetId: budget.id,
      statuses,
      winners,
      budgetStatus: final.status,
      serviceOrderStatus: orderNow.status,
    });
    check(final, { 'uma única decisão gravada': (b) => ['ACCEPTED', 'REFUSED'].includes(b.status) });
  });
}

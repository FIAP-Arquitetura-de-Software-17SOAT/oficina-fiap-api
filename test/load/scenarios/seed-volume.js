// Popula o banco de carga com VOLUME ordens de serviço, pela própria API, para
// o read-heavy medir as listagens com volume. Metade fica concluída (alimenta
// a métrica de tempo médio); a outra metade se divide entre recebida e em
// diagnóstico. O volume é cumulativo: recrie o ambiente (load:down/load:up)
// antes de semear outro patamar.
import exec from 'k6/execution';
import { api, expectStatus } from '../lib/api.js';
import {
  adminApi,
  adminToken,
  catalog,
  customerWithVehicle,
  openServiceOrder,
  pickCatalog,
  sentBudget,
  serviceOrderInDiagnosis,
} from '../lib/fixtures.js';

const VOLUME = Number(__ENV.VOLUME || 1000);

export const options = {
  scenarios: {
    seed: {
      executor: 'shared-iterations',
      vus: Number(__ENV.SEED_VUS || 20),
      iterations: VOLUME,
      maxDuration: '2h',
    },
  },
  setupTimeout: '2m',
  thresholds: { checks: ['rate>0.99'] },
};

export function setup() {
  const token = adminToken();
  return { token, catalog: catalog(api(token)) };
}

export default function ({ catalog: catalogData }) {
  const a = adminApi();
  const owner = customerWithVehicle(a);
  const i = exec.scenario.iterationInTest;

  if (i % 4 === 0) {
    openServiceOrder(a, owner);
    return;
  }
  if (i % 4 === 1) {
    serviceOrderInDiagnosis(a, owner);
    return;
  }

  const order = serviceOrderInDiagnosis(a, owner);
  const budget = sentBudget(a, order.id, pickCatalog(catalogData));
  expectStatus(a.acceptBudget(budget.id), 200, 'aceitar orçamento');
  expectStatus(a.dispatchParts(order.id), 200, 'baixar peças');
  expectStatus(a.complete(order.id), 200, 'concluir OS');
}

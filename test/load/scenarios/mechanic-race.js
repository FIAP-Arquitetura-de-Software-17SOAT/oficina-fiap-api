// Regra: um mecânico não pega outra OS antes de concluir a atual. O caso de
// uso checa antes de gravar (assign-mechanic.use-case.ts) e um índice único
// parcial (migration 20260821040000) fecha a corrida no banco. Este cenário
// atribui o mesmo mecânico a várias OSs ao mesmo tempo: o esperado é 1
// sucesso e o resto 409 MECHANIC_BUSY — nunca 500.
import { check, group } from 'k6';
import http from 'k6/http';
import { api, batchItem, expectStatus } from '../lib/api.js';
import { uuid } from '../lib/data.js';
import { adminToken, customerWithVehicle, openServiceOrder } from '../lib/fixtures.js';
import { countStatuses, raceOptions, violationCounter } from '../lib/race.js';

const ORDERS = 5;

const doubleAssignment = violationCounter('mechanic_double_assignment');
const serverError = violationCounter('mechanic_race_server_error');

export const options = raceOptions(['mechanic_double_assignment', 'mechanic_race_server_error']);

export function setup() {
  return { token: adminToken() };
}

export default function ({ token }) {
  const a = api(token);

  group('mesmo mecânico em várias OSs simultâneas', () => {
    const owner = customerWithVehicle(a);
    const orders = Array.from({ length: ORDERS }, () => openServiceOrder(a, owner));
    const mechanicId = uuid();

    const responses = http.batch(
      orders.map((order) =>
        batchItem('PATCH', `/service-orders/${order.id}/assign`, { mechanicId }, {
          token,
          name: '/service-orders/:id/assign',
          expected: [200, 409],
        }),
      ),
    );
    const statuses = countStatuses(responses);

    const assigned = orders
      .map((order) => expectStatus(a.getServiceOrder(order.id), 200, 'consultar OS'))
      .filter((order) => order.mechanicId === mechanicId).length;

    doubleAssignment.record(assigned !== 1 || statuses[200] !== 1, { mechanicId, statuses, assigned });
    serverError.record(statuses[409] !== ORDERS - 1, { mechanicId, statuses });
    check(assigned, { 'mecânico ficou com exatamente uma OS': (n) => n === 1 });
  });
}

import { check, group, sleep } from 'k6';
import { expectStatus } from './api.js';
import {
  customerWithVehicle,
  openServiceOrder,
  payBilling,
  pickCatalog,
  sentBudget,
} from './fixtures.js';
import { uuid } from './data.js';

/** Pausa de "uso humano" entre etapas; zero no smoke. */
function think(pauseSeconds) {
  if (pauseSeconds > 0) sleep(pauseSeconds * (0.5 + Math.random()));
}

/**
 * Jornada completa da oficina, da recepção à entrega. Cada etapa é um
 * `group`, então o resumo do k6 mostra a latência por etapa.
 */
export function serviceOrderJourney(a, catalogData, { pause = 1 } = {}) {
  const items = pickCatalog(catalogData);
  let owner;
  let order;
  let budget;
  let billing;

  group('01 recepção: cliente, veículo e OS', () => {
    owner = customerWithVehicle(a);
    order = openServiceOrder(a, owner);
  });
  think(pause);

  group('02 diagnóstico: atribuir mecânico', () => {
    // Mecânico novo por iteração: a regra "um mecânico por OS aberta" é
    // exercitada no cenário de corrida, não aqui.
    expectStatus(a.assign(order.id, uuid()), 200, 'atribuir mecânico');
  });
  think(pause);

  group('03 orçamento: criar e enviar', () => {
    budget = sentBudget(a, order.id, items);
  });
  think(pause);

  group('04 aprovação: aceitar orçamento', () => {
    expectStatus(a.acceptBudget(budget.id), 200, 'aceitar orçamento');
  });
  think(pause);

  group('05 execução: baixar peças e concluir', () => {
    const dispatch = expectStatus(a.dispatchParts(order.id), 200, 'baixar peças');
    check(dispatch, { 'peças baixadas sem pedido de compra': (d) => d.dispatched === true });
    expectStatus(a.complete(order.id), 200, 'concluir OS');
  });
  think(pause);

  group('06 cobrança: gerar e pagar', () => {
    billing = expectStatus(a.generateBilling(order.id), 201, 'gerar cobrança');
    check(billing, { 'cobrança aguardando pagamento': (b) => b.status === 'WAITING_PAYMENT' });
    payBilling(billing);
  });
  think(pause);

  group('07 entrega', () => {
    expectStatus(a.deliverBilled(billing.id), 204, 'entregar OS');
    const final = expectStatus(a.getServiceOrder(order.id), 200, 'consultar OS');
    check(final, { 'OS entregue': (o) => o.status === 'DELIVERED' });
  });

  return { owner, order, budget, billing };
}

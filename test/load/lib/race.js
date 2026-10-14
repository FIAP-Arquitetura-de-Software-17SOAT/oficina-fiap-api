import { Counter } from 'k6/metrics';

/**
 * Opções comuns dos cenários de corrida: 1 VU repetindo a corrida
 * `ITERATIONS` vezes (cada iteração dispara as requisições juntas com
 * `http.batch`). Cada invariante vira um contador com threshold `count==0`,
 * então o `k6 run` sai com erro se alguma corrida violar a regra.
 */
export function raceOptions(violationMetrics) {
  const thresholds = { checks: ['rate==1'] };
  for (const name of violationMetrics) thresholds[name] = ['count==0'];
  return {
    scenarios: {
      race: {
        executor: 'per-vu-iterations',
        vus: 1,
        iterations: Number(__ENV.ITERATIONS || 20),
        maxDuration: '10m',
      },
    },
    thresholds,
  };
}

/** Contador que sempre recebe uma amostra, para o threshold ser avaliado. */
export function violationCounter(name) {
  const counter = new Counter(name);
  return {
    record(violated, detail) {
      counter.add(violated ? 1 : 0);
      if (violated) console.error(`[${name}] ${JSON.stringify(detail)}`);
    },
  };
}

export function countStatuses(responses) {
  const counts = {};
  for (const r of responses) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}

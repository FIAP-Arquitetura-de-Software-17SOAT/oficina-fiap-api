// Rotação de refresh token: o mesmo token consumido em paralelo deve render
// um único par novo (refresh-tokens.use-case.ts rotaciona de forma
// condicional). Os demais recebem 401, e o token vencedor continua válido.
import { check, group } from 'k6';
import http from 'k6/http';
import { adminCredentials } from '../lib/config.js';
import { auth, batchItem, expectStatus, loginOrFail } from '../lib/api.js';
import { countStatuses, raceOptions, violationCounter } from '../lib/race.js';

const PARALLEL_REFRESHES = 10;

const doubleSpend = violationCounter('refresh_double_spend');

export const options = raceOptions(['refresh_double_spend']);

export default function () {
  const { email, password } = adminCredentials();

  group('mesmo refresh token em paralelo', () => {
    const { refreshToken } = loginOrFail(email, password);

    const responses = http.batch(
      Array.from({ length: PARALLEL_REFRESHES }, () =>
        batchItem('POST', '/auth/refresh', { refreshToken }, { name: '/auth/refresh', expected: [200, 401] }),
      ),
    );
    const statuses = countStatuses(responses);
    const winners = responses.filter((r) => r.status === 200);

    doubleSpend.record(statuses[200] !== 1, { statuses });

    if (winners.length > 0) {
      const next = expectStatus(auth.refresh(winners[0].json('refreshToken')), 200, 'refresh com o token vencedor');
      check(next, { 'token vencedor gera novo par': (t) => Boolean(t.accessToken) });
      expectStatus(auth.logout(next.refreshToken), 204, 'logout');
    }
  });
}

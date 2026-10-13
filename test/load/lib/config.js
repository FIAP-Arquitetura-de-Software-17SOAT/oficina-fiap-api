import { fail } from 'k6';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
export const API = `${BASE_URL}/api/v1`;
export const WEBHOOK_SECRET = __ENV.STRIPE_WEBHOOK_SECRET || 'whsec_load';
export const MAILPIT_URL = __ENV.MAILPIT_URL || 'http://localhost:8025';
export const PROFILE = __ENV.PROFILE || 'smoke';

export function adminCredentials() {
  const email = __ENV.ADMIN_EMAIL;
  const password = __ENV.ADMIN_PASSWORD;
  if (!email || !password) {
    fail('ADMIN_EMAIL e ADMIN_PASSWORD são obrigatórios (vêm do .env)');
  }
  return { email, password };
}

/** Thresholds comuns a todo cenário de carga. */
export const baseThresholds = {
  http_req_failed: ['rate<0.01'],
  checks: ['rate>0.99'],
};

/**
 * Escolhe o perfil de execução por `PROFILE`. Cada cenário declara os perfis
 * que suporta; um perfil desconhecido aborta antes de gerar carga.
 */
export function pickProfile(profiles) {
  const profile = profiles[PROFILE];
  if (!profile) {
    fail(
      `PROFILE=${PROFILE} não existe neste cenário. Use: ${Object.keys(profiles).join(', ')}`,
    );
  }
  return profile;
}

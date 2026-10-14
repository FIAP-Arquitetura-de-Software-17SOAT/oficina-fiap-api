import crypto from 'k6/crypto';
import { API, WEBHOOK_SECRET } from './config.js';

/**
 * Evento `checkout.session.completed` pago, assinado como o Stripe assina:
 * `t=<unix>,v1=<hex(hmacSHA256(secret, "<t>.<payload>"))>`. O gateway da API
 * verifica a assinatura com o SDK oficial, então o evento passa pelo mesmo
 * caminho de produção.
 */
export function paidCheckoutEvent(sessionId, { secret = WEBHOOK_SECRET } = {}) {
  const created = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
    id: `evt_load_${sessionId}_${created}`,
    object: 'event',
    type: 'checkout.session.completed',
    created,
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        payment_status: 'paid',
        status: 'complete',
      },
    },
  });
  const signature = crypto.hmac('sha256', secret, `${created}.${payload}`, 'hex');
  return { payload, signature: `t=${created},v1=${signature}` };
}

/** Requisição do webhook no formato de `http.batch` (rota pública). */
export function webhookRequest(event, expected) {
  const params = {
    headers: { 'Content-Type': 'application/json', 'stripe-signature': event.signature },
    tags: { name: '/billings/stripe/webhook' },
  };
  if (expected) params.responseCallback = expected;
  return { method: 'POST', url: `${API}/billings/stripe/webhook`, body: event.payload, params };
}

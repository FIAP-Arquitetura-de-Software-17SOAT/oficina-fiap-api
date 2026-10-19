// Fake mínimo da API do Stripe para os testes de carga (test/load).
// Cobre só o que o StripePaymentGateway chama: criar e consultar Checkout
// Session. Ids únicos por sessão — o stripe-mock oficial devolve ids fixos e
// quebraria o @unique de gatewayTransactionId na segunda cobrança.
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 12111);
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://stripe-fake:${PORT}`;
const SESSION_TTL_SECONDS = 24 * 60 * 60;

const sessions = new Map();
// Como no Stripe real, repetir a Idempotency-Key devolve a mesma sessão.
const byIdempotencyKey = new Map();

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function stripeError(res, status, message) {
  send(res, status, {
    error: { type: 'invalid_request_error', message },
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function createSession(form) {
  const id = `cs_test_${randomUUID().replaceAll('-', '')}`;
  const session = {
    id,
    object: 'checkout.session',
    mode: 'payment',
    status: 'open',
    payment_status: 'unpaid',
    url: `${PUBLIC_URL}/pay/${id}`,
    client_reference_id: form.get('client_reference_id'),
    amount_total: Number(form.get('line_items[0][price_data][unit_amount]')),
    currency: form.get('line_items[0][price_data][currency]'),
    metadata: {
      billingId: form.get('metadata[billingId]'),
      serviceOrderId: form.get('metadata[serviceOrderId]'),
    },
    created: Math.floor(Date.now() / 1000),
    expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  sessions.set(id, session);
  return session;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  try {
    if (req.method === 'GET' && url.pathname === '/__health') {
      return send(res, 200, { status: 'ok', sessions: sessions.size });
    }

    if (req.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
      const key = req.headers['idempotency-key'];
      if (typeof key === 'string' && byIdempotencyKey.has(key)) {
        return send(res, 200, sessions.get(byIdempotencyKey.get(key)));
      }
      const session = createSession(new URLSearchParams(await readBody(req)));
      if (typeof key === 'string') {
        byIdempotencyKey.set(key, session.id);
      }
      return send(res, 200, session);
    }

    const retrieve = url.pathname.match(/^\/v1\/checkout\/sessions\/([^/]+)$/);
    if (req.method === 'GET' && retrieve) {
      const session = sessions.get(decodeURIComponent(retrieve[1]));
      return session
        ? send(res, 200, session)
        : stripeError(res, 404, `No such checkout.session: '${retrieve[1]}'`);
    }

    return stripeError(res, 404, `Unrecognized request URL (${req.method}: ${url.pathname})`);
  } catch (error) {
    return stripeError(res, 500, String(error));
  }
});

server.listen(PORT, () => {
  console.log(`stripe-fake listening on :${PORT}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

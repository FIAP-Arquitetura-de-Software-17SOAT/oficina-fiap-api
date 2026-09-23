import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac } from 'crypto';
import {
  BUDGET_WEBHOOK_SIGNATURE_HEADER,
  BUDGET_WEBHOOK_TIMESTAMP_HEADER,
  BudgetWebhookSignatureGuard,
  signBudgetWebhook,
} from './budget-webhook-signature.guard';

const SECRET = 'budget-webhook-secret';
const NOW = 1_790_000_000;

describe('BudgetWebhookSignatureGuard', () => {
  const body = Buffer.from('{"budgetId":"b","decision":"APPROVED"}');

  const contextWith = (headers: Record<string, string>, rawBody?: Buffer) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers, rawBody }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const guardWith = (secret: string | undefined) =>
    new BudgetWebhookSignatureGuard({ get: () => secret } as never);

  const signedHeaders = (timestamp = NOW, payload = body, secret = SECRET) => ({
    [BUDGET_WEBHOOK_TIMESTAMP_HEADER]: String(timestamp),
    [BUDGET_WEBHOOK_SIGNATURE_HEADER]: signBudgetWebhook(
      secret,
      String(timestamp),
      payload,
    ),
  });

  it('assina com HMAC-SHA256 de "timestamp.corpo", prefixado com sha256=', () => {
    const expected = createHmac('sha256', SECRET)
      .update(`${NOW}.`)
      .update(body)
      .digest('hex');

    expect(signBudgetWebhook(SECRET, String(NOW), body)).toBe(
      `sha256=${expected}`,
    );
  });

  it('deixa passar a requisição assinada com o segredo', () => {
    expect(
      guardWith(SECRET).canActivate(contextWith(signedHeaders(), body)),
    ).toBe(true);
  });

  it.each([
    [
      'sem assinatura',
      () => ({ [BUDGET_WEBHOOK_TIMESTAMP_HEADER]: String(NOW) }),
    ],
    [
      'sem timestamp',
      () => ({ [BUDGET_WEBHOOK_SIGNATURE_HEADER]: 'sha256=00' }),
    ],
    ['assinada com outro segredo', () => signedHeaders(NOW, body, 'outro')],
    [
      'com o corpo alterado depois de assinar',
      () => signedHeaders(NOW, Buffer.from('{"decision":"REFUSED"}')),
    ],
    ['com timestamp velho demais', () => signedHeaders(NOW - 301)],
    ['com timestamp no futuro demais', () => signedHeaders(NOW + 301)],
    [
      'com timestamp que não é número',
      () => ({
        ...signedHeaders(),
        [BUDGET_WEBHOOK_TIMESTAMP_HEADER]: 'ontem',
      }),
    ],
  ])('recusa com 401 a requisição %s', (_case, headers) => {
    expect(() =>
      guardWith(SECRET).canActivate(contextWith(headers(), body)),
    ).toThrow(UnauthorizedException);
  });

  it('recusa com 401 quando não há corpo bruto para conferir', () => {
    expect(() =>
      guardWith(SECRET).canActivate(contextWith(signedHeaders())),
    ).toThrow(UnauthorizedException);
  });

  it('fica fechado com 503 quando o segredo não está configurado', () => {
    expect(() =>
      guardWith(undefined).canActivate(contextWith(signedHeaders(), body)),
    ).toThrow(ServiceUnavailableException);
  });
});

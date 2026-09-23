import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

export const BUDGET_WEBHOOK_SIGNATURE_HEADER = 'x-budget-webhook-signature';
export const BUDGET_WEBHOOK_TIMESTAMP_HEADER = 'x-budget-webhook-timestamp';

/** Janela contra replay: uma requisição capturada só vale por 5 minutos. */
const TOLERANCE_SECONDS = 300;

/**
 * Assinatura que o sistema externo manda em `x-budget-webhook-signature`:
 * `sha256=` + HMAC-SHA256 (hex) de `<timestamp>.<corpo bruto>` com o segredo
 * compartilhado. O timestamp entra na assinatura para que não dê para reenviar
 * o mesmo corpo com um horário novo.
 */
export function signBudgetWebhook(
  secret: string,
  timestamp: string,
  rawBody: Buffer,
): string {
  const digest = createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');

  return `sha256=${digest}`;
}

/**
 * Autentica o webhook de decisão do orçamento. É guard, e não conferência no
 * controller, porque guard roda antes da validação do corpo: quem não assina
 * não recebe nem as mensagens de validação.
 */
@Injectable()
export class BudgetWebhookSignatureGuard implements CanActivate {
  private readonly logger = new Logger(BudgetWebhookSignatureGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>('BUDGET_WEBHOOK_SECRET')?.trim();

    // Sem segredo não há como autenticar: fecha a rota em vez de abri-la.
    if (!secret) {
      this.logger.error('BUDGET_WEBHOOK_SECRET is not configured');
      throw new ServiceUnavailableException(
        'Webhook de orçamento não configurado',
      );
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      rawBody?: Buffer;
    }>();
    const signature = request.headers[BUDGET_WEBHOOK_SIGNATURE_HEADER];
    const timestamp = request.headers[BUDGET_WEBHOOK_TIMESTAMP_HEADER];

    if (
      typeof signature !== 'string' ||
      typeof timestamp !== 'string' ||
      !request.rawBody ||
      !this.isFresh(timestamp) ||
      !this.matches(
        signBudgetWebhook(secret, timestamp, request.rawBody),
        signature,
      )
    ) {
      throw new UnauthorizedException('Assinatura do webhook inválida');
    }

    return true;
  }

  private isFresh(timestamp: string): boolean {
    if (!/^\d+$/.test(timestamp)) return false;

    const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
    return ageSeconds <= TOLERANCE_SECONDS;
  }

  private matches(expected: string, received: string): boolean {
    const a = Buffer.from(expected);
    const b = Buffer.from(received);

    return a.length === b.length && timingSafeEqual(a, b);
  }
}

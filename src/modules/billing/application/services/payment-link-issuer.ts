import { randomUUID } from 'crypto';
import { BillingRepositoryPort } from '../ports/billing-repository.port';
import {
  CreatePaymentLinkResult,
  PaymentGatewayPort,
} from '../ports/payment-gateway.port';

export interface IssuePaymentLinkInput {
  billingId: string;
  serviceOrderId: string;
  amountInCents: number;
}

/**
 * Abre a sessão de checkout no gateway e registra a sessão **antes** de a
 * cobrança mudar de estado: se a gravação da cobrança perder a corrida, o
 * webhook dessa sessão ainda encontra a cobrança e quita.
 */
export class PaymentLinkIssuer {
  constructor(
    private readonly billings: BillingRepositoryPort,
    private readonly gateway: PaymentGatewayPort,
  ) {}

  async issue(input: IssuePaymentLinkInput): Promise<CreatePaymentLinkResult> {
    const link = await this.gateway.createPaymentLink({
      ...input,
      // Uma chave por tentativa: cada chamada abre uma sessão nova no gateway,
      // e a sessão antiga continua reconhecida pelo webhook.
      idempotencyKey: `billing-payment-link:${input.billingId}:${randomUUID()}`,
    });
    await this.billings.registerCheckoutSession(
      input.billingId,
      link.gatewayTransactionId,
    );
    return link;
  }
}

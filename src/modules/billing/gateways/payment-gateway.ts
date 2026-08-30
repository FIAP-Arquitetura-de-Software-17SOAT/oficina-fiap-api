import { PaymentMethod } from '../enums/payment-method.enum';

export interface CreatePaymentLinkInput {
  billingId: string;
  serviceOrderId: string;
  amountInCents: number;
  idempotencyKey: string;
}

export interface CreatePaymentLinkResult {
  paymentLink: string;
  gatewayTransactionId: string;
  expiresAt: Date | null;
}

export interface ParsePaymentWebhookInput {
  payload: Buffer | string;
  signature: string;
}

export class InvalidPaymentWebhookSignatureError extends Error {
  constructor() {
    super('Assinatura do webhook do Stripe inválida');
    this.name = InvalidPaymentWebhookSignatureError.name;
  }
}

/**
 * Estado da sessão de checkout consultado direto no gateway.
 *
 * O retorno de sucesso do Stripe chega pelo navegador do cliente, então a URL é
 * palpite de qualquer um. Nada do que ela diz vale: quem confirma o pagamento é
 * o gateway, consultado por este método.
 */
export type PaymentStatusResult =
  | {
      status: 'paid';
      gatewayTransactionId: string;
      method: PaymentMethod;
      paidAt: Date;
    }
  | { status: 'unpaid'; gatewayTransactionId: string };

export type PaymentWebhookResult =
  | {
      type: 'payment_confirmed';
      gatewayTransactionId: string;
      method: PaymentMethod;
      paidAt: Date;
    }
  | { type: 'ignored'; reason: string };

export abstract class PaymentGateway {
  abstract createPaymentLink(
    input: CreatePaymentLinkInput,
  ): Promise<CreatePaymentLinkResult>;

  abstract parsePaymentWebhook(
    input: ParsePaymentWebhookInput,
  ): Promise<PaymentWebhookResult>;

  abstract getPaymentStatus(
    gatewayTransactionId: string,
  ): Promise<PaymentStatusResult>;
}

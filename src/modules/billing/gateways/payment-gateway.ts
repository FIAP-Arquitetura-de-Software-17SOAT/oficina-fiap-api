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
}

import Stripe from 'stripe';
import { PaymentMethod } from '../enums/payment-method.enum';
import {
  CreatePaymentLinkInput,
  CreatePaymentLinkResult,
  InvalidPaymentWebhookSignatureError,
  ParsePaymentWebhookInput,
  PaymentGateway,
  PaymentWebhookResult,
} from './payment-gateway';

export class StripePaymentGateway extends PaymentGateway {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;
  private readonly successUrl: string;
  private readonly cancelUrl: string;

  constructor() {
    super();
    const secretKey = requiredSetting('STRIPE_SECRET_KEY');
    if (!secretKey.startsWith('sk_test_')) {
      throw new Error('STRIPE_SECRET_KEY must be a Stripe test key');
    }

    this.stripe = new Stripe(secretKey);
    this.webhookSecret = requiredSetting('STRIPE_WEBHOOK_SECRET');
    this.successUrl = requiredSetting('PAYMENT_SUCCESS_URL');
    this.cancelUrl = requiredSetting('PAYMENT_CANCEL_URL');
  }

  async createPaymentLink(
    input: CreatePaymentLinkInput,
  ): Promise<CreatePaymentLinkResult> {
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        success_url: this.successUrl,
        cancel_url: this.cancelUrl,
        client_reference_id: input.billingId,
        metadata: {
          billingId: input.billingId,
          serviceOrderId: input.serviceOrderId,
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'brl',
              unit_amount: input.amountInCents,
              product_data: {
                name: `Oficina FIAP service order ${input.serviceOrderId}`,
              },
            },
          },
        ],
      },
      { idempotencyKey: input.idempotencyKey },
    );

    if (!session.url) {
      throw new Error('Stripe Checkout Session URL is required');
    }

    return {
      paymentLink: session.url,
      gatewayTransactionId: session.id,
      expiresAt: session.expires_at
        ? new Date(session.expires_at * 1000)
        : null,
    };
  }

  parsePaymentWebhook(
    input: ParsePaymentWebhookInput,
  ): Promise<PaymentWebhookResult> {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        input.payload,
        input.signature,
        this.webhookSecret,
      );
    } catch (error) {
      if (isStripeSignatureVerificationError(error)) {
        return Promise.reject(new InvalidPaymentWebhookSignatureError());
      }
      return Promise.reject(
        error instanceof Error ? error : new Error('Stripe webhook failed'),
      );
    }

    if (event.type !== 'checkout.session.completed') {
      return Promise.resolve({
        type: 'ignored',
        reason: `Unsupported Stripe event: ${event.type}`,
      });
    }

    const session = event.data.object;
    if (session.payment_status !== 'paid') {
      return Promise.resolve({
        type: 'ignored',
        reason: 'Checkout Session payment is not paid',
      });
    }

    return Promise.resolve({
      type: 'payment_confirmed',
      gatewayTransactionId: session.id,
      method: PaymentMethod.CARD,
      paidAt: new Date(event.created * 1000),
    });
  }
}

function isStripeSignatureVerificationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'type' in error &&
    error.type === 'StripeSignatureVerificationError'
  );
}

function requiredSetting(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

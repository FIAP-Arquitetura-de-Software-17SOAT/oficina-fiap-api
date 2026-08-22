import Stripe from 'stripe';
import { PaymentMethod } from '../enums/payment-method.enum';
import {
  CreatePaymentLinkInput,
  CreatePaymentLinkResult,
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
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
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
    });

    return {
      paymentLink: session.url!,
      gatewayTransactionId: session.id,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
    };
  }

  async parsePaymentWebhook(
    input: ParsePaymentWebhookInput,
  ): Promise<PaymentWebhookResult> {
    const event = this.stripe.webhooks.constructEvent(
      input.payload,
      input.signature,
      this.webhookSecret,
    );

    if (event.type !== 'checkout.session.completed') {
      return { type: 'ignored', reason: `Unsupported Stripe event: ${event.type}` };
    }

    const session = event.data.object as Stripe.Checkout.Session;
    return {
      type: 'payment_confirmed',
      gatewayTransactionId: session.id,
      method: PaymentMethod.CARD,
      paidAt: new Date(event.created * 1000),
    };
  }
}

function requiredSetting(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

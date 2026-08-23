import {
  CreatePaymentLinkInput,
  CreatePaymentLinkResult,
  ParsePaymentWebhookInput,
  PaymentGateway,
  PaymentWebhookResult,
} from './payment-gateway';

export class FakePaymentGateway extends PaymentGateway {
  private webhookResults: PaymentWebhookResult[] = [];

  async createPaymentLink(
    input: CreatePaymentLinkInput,
  ): Promise<CreatePaymentLinkResult> {
    return {
      paymentLink: `https://fake.stripe.test/checkout/${input.billingId}`,
      gatewayTransactionId: `fake_session_${input.billingId}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  }

  async parsePaymentWebhook(
    _input: ParsePaymentWebhookInput,
  ): Promise<PaymentWebhookResult> {
    return (
      this.webhookResults.shift() ?? {
        type: 'ignored',
        reason: 'No fake webhook event queued',
      }
    );
  }

  queueWebhookResult(result: PaymentWebhookResult): void {
    this.webhookResults.push(result);
  }
}

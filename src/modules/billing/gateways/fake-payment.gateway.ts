import {
  CreatePaymentLinkInput,
  CreatePaymentLinkResult,
  ParsePaymentWebhookInput,
  PaymentGateway,
  PaymentWebhookResult,
} from './payment-gateway';

export class FakePaymentGateway extends PaymentGateway {
  private webhookResults: PaymentWebhookResult[] = [];

  createPaymentLink(
    input: CreatePaymentLinkInput,
  ): Promise<CreatePaymentLinkResult> {
    return Promise.resolve({
      paymentLink: `https://fake.stripe.test/checkout/${input.idempotencyKey}`,
      gatewayTransactionId: `fake_session_${input.idempotencyKey}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  }

  parsePaymentWebhook(
    input: ParsePaymentWebhookInput,
  ): Promise<PaymentWebhookResult> {
    void input;

    return Promise.resolve(
      this.webhookResults.shift() ?? {
        type: 'ignored',
        reason: 'No fake webhook event queued',
      },
    );
  }

  queueWebhookResult(result: PaymentWebhookResult): void {
    this.webhookResults.push(result);
  }
}

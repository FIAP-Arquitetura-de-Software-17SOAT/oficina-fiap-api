import {
  CreatePaymentLinkInput,
  CreatePaymentLinkResult,
  ParsePaymentWebhookInput,
  PaymentGateway,
  PaymentStatusResult,
  PaymentWebhookResult,
} from './payment-gateway';

export class FakePaymentGateway extends PaymentGateway {
  private webhookResults: PaymentWebhookResult[] = [];
  private paidSessions = new Map<string, PaymentStatusResult>();

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

  getPaymentStatus(gatewayTransactionId: string): Promise<PaymentStatusResult> {
    return Promise.resolve(
      this.paidSessions.get(gatewayTransactionId) ?? {
        status: 'unpaid',
        gatewayTransactionId,
      },
    );
  }

  queueWebhookResult(result: PaymentWebhookResult): void {
    this.webhookResults.push(result);
  }

  markSessionPaid(
    result: Extract<PaymentStatusResult, { status: 'paid' }>,
  ): void {
    this.paidSessions.set(result.gatewayTransactionId, result);
  }
}

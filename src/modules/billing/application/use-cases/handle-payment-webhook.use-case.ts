import { BillingApplicationError } from '../errors/billing-application.error';
import {
  InvalidPaymentWebhookSignatureError,
  PaymentGatewayPort,
} from '../ports/payment-gateway.port';
import { BillingStore } from '../services/billing-store';
import { PaymentSettlement } from '../services/payment-settlement';

/**
 * Webhook do gateway. A assinatura é verificada pelo gateway; um evento que
 * não interessa é ignorado com 2xx, senão o gateway reenvia para sempre.
 */
export class HandlePaymentWebhookUseCase {
  constructor(
    private readonly store: BillingStore,
    private readonly gateway: PaymentGatewayPort,
    private readonly settlement: PaymentSettlement,
  ) {}

  async execute(payload: Buffer | string, signature: string): Promise<void> {
    let event;
    try {
      event = await this.gateway.parsePaymentWebhook({ payload, signature });
    } catch (error) {
      if (error instanceof InvalidPaymentWebhookSignatureError) {
        throw new BillingApplicationError('INVALID_WEBHOOK_SIGNATURE');
      }
      throw error;
    }
    if (event.type === 'ignored') return;

    const billing = await this.store.findByGatewayTransactionId(
      event.gatewayTransactionId,
    );

    await this.settlement.settle(billing, {
      gatewayTransactionId: event.gatewayTransactionId,
      method: event.method,
      paidAt: event.paidAt,
    });
  }
}

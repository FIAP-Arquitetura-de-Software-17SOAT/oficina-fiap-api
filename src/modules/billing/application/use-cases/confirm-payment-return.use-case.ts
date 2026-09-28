import { PaymentReturn } from '../contracts/billing.input';
import { BillingApplicationError } from '../errors/billing-application.error';
import { BillingStore } from '../services/billing-store';
import { PaymentSettlement } from '../services/payment-settlement';

/**
 * Retorno de sucesso do checkout (`PAYMENT_SUCCESS_URL`). A URL chega pelo
 * navegador do cliente, então ela não prova nada: quem diz se a sessão foi
 * paga é o gateway. Só com a confirmação dele a cobrança é quitada e a OS vai
 * para entregue — caso contrário nada muda de status.
 *
 * É idempotente de propósito: o webhook e este retorno disputam a mesma
 * cobrança, e quem chegar depois só encontra o trabalho já feito.
 */
export class ConfirmPaymentReturnUseCase {
  constructor(
    private readonly store: BillingStore,
    private readonly settlement: PaymentSettlement,
  ) {}

  async execute(gatewayTransactionId: string): Promise<PaymentReturn> {
    const sessionId = gatewayTransactionId.trim();
    if (!sessionId) {
      throw new BillingApplicationError('CHECKOUT_SESSION_REQUIRED');
    }

    const billing = await this.store.findByGatewayTransactionId(sessionId);
    const payment = await this.settlement.confirmWithGateway(sessionId);

    return payment
      ? this.settlement.settleAndDeliver(billing, payment)
      : this.settlement.paymentReturn(billing);
  }
}

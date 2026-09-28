import { BillingStatus } from '../../domain/enums/billing-status.enum';
import { PaymentReturn } from '../contracts/billing.input';
import { ServiceOrderPort } from '../ports/service-order.port';
import { BillingStore } from '../services/billing-store';
import { PaymentSettlement } from '../services/payment-settlement';

/**
 * Retorno de cancelamento do checkout (`PAYMENT_CANCEL_URL`): o cliente
 * abandonou o checkout. O serviço está pronto e a cobrança continua de pé, e é
 * isso que a OS passa a dizer — cobrança em aberto.
 */
export class RegisterPaymentCancellationUseCase {
  constructor(
    private readonly store: BillingStore,
    private readonly serviceOrders: ServiceOrderPort,
    private readonly settlement: PaymentSettlement,
  ) {}

  async execute(billingId: string): Promise<PaymentReturn> {
    const billing = await this.store.findById(billingId.trim());
    const gatewayTransactionId = billing.getGatewayTransactionId();

    if (billing.getStatus() !== BillingStatus.PAID && gatewayTransactionId) {
      // O retorno de cancelamento também é palpite de quem chamar a URL. Se o
      // gateway já registrou o pagamento, vale o gateway: quitar e entregar, em
      // vez de rebaixar uma OS paga para cobrança em aberto.
      const payment =
        await this.settlement.confirmWithGateway(gatewayTransactionId);
      if (payment) {
        return this.settlement.settleAndDeliver(billing, payment);
      }
    }

    if (billing.getStatus() === BillingStatus.PAID) {
      return this.settlement.paymentReturn(billing);
    }

    const serviceOrder = await this.store.requireServiceOrder(
      billing.getServiceOrderId(),
    );
    if (serviceOrder.status !== 'COMPLETED') {
      return { billing, serviceOrder };
    }

    return {
      billing,
      serviceOrder: await this.serviceOrders.awaitPayment(serviceOrder.id),
    };
  }
}

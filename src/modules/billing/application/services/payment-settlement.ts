import { Billing } from '../../domain/entities/billing.entity';
import { BillingStatus } from '../../domain/enums/billing-status.enum';
import { PaymentMethod } from '../../domain/enums/payment-method.enum';
import { PaymentReturn } from '../contracts/billing.input';
import { BillingApplicationError } from '../errors/billing-application.error';
import { BillingRepositoryPort } from '../ports/billing-repository.port';
import { PaymentGatewayPort } from '../ports/payment-gateway.port';
import {
  ServiceOrderPort,
  ServiceOrderSummary,
} from '../ports/service-order.port';
import { BillingStore } from './billing-store';

export interface RegisteredPayment {
  gatewayTransactionId: string;
  method: PaymentMethod;
  paidAt: Date;
}

// Depois de quitada a cobrança, só estes estados de OS ainda podem virar
// entrega. Qualquer outro (já entregue, cancelada) fica como está.
const DELIVERABLE_STATUSES = ['COMPLETED', 'AWAITING_PAYMENT'];

/**
 * Caminho único de quitação. Três entradas chegam aqui — o webhook do gateway,
 * o retorno de sucesso e o retorno de cancelamento — e disputam a mesma
 * cobrança, então tudo é tolerante a repetição: cobrança já paga devolve o que
 * está gravado em vez de estourar.
 */
export class PaymentSettlement {
  constructor(
    private readonly billings: BillingRepositoryPort,
    private readonly store: BillingStore,
    private readonly gateway: PaymentGatewayPort,
    private readonly serviceOrders: ServiceOrderPort,
  ) {}

  /**
   * As URLs de retorno chegam pelo navegador do cliente, então não provam
   * nada: quem diz se a sessão foi paga é o gateway.
   */
  async confirmWithGateway(
    gatewayTransactionId: string,
  ): Promise<RegisteredPayment | null> {
    const status = await this.gateway.getPaymentStatus(gatewayTransactionId);
    if (status.status !== 'paid') return null;

    return {
      gatewayTransactionId: status.gatewayTransactionId,
      method: status.method,
      paidAt: status.paidAt,
    };
  }

  async settle(billing: Billing, payment: RegisteredPayment): Promise<Billing> {
    await this.billings.recordCheckoutSessionPayment(
      payment.gatewayTransactionId,
      payment.method,
      payment.paidAt,
    );

    const expectedUpdatedAt = new Date(billing.getUpdatedAt());
    const changed = billing.registerPayment(payment, true);
    if (!changed) return billing;

    const updated = await this.billings.update(billing, expectedUpdatedAt);
    if (updated) return updated;

    // Perdeu a corrida: se quem ganhou já quitou, o resultado é o mesmo.
    const stored = await this.billings.findByGatewayTransactionId(
      payment.gatewayTransactionId,
    );
    if (stored?.getStatus() === BillingStatus.PAID) return stored;

    throw new BillingApplicationError('BILLING_CONCURRENT_UPDATE');
  }

  async settleAndDeliver(
    billing: Billing,
    payment: RegisteredPayment,
  ): Promise<PaymentReturn> {
    const paid = await this.settle(billing, payment);
    return { billing: paid, serviceOrder: await this.deliverPaidOrder(paid) };
  }

  async deliverPaidOrder(billing: Billing): Promise<ServiceOrderSummary> {
    const serviceOrder = await this.store.requireServiceOrder(
      billing.getServiceOrderId(),
    );
    if (!DELIVERABLE_STATUSES.includes(serviceOrder.status)) {
      return serviceOrder;
    }
    return this.serviceOrders.deliver(serviceOrder.id);
  }

  async paymentReturn(billing: Billing): Promise<PaymentReturn> {
    return {
      billing,
      serviceOrder: await this.store.requireServiceOrder(
        billing.getServiceOrderId(),
      ),
    };
  }
}

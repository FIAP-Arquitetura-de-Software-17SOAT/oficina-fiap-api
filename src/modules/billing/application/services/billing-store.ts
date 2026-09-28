import { Billing } from '../../domain/entities/billing.entity';
import { BillingApplicationError } from '../errors/billing-application.error';
import { BillingRepositoryPort } from '../ports/billing-repository.port';
import {
  ServiceOrderPort,
  ServiceOrderSummary,
} from '../ports/service-order.port';

/** O que vários casos de uso da cobrança repetem: carregar e gravar com compare-and-set. */
export class BillingStore {
  constructor(
    private readonly billings: BillingRepositoryPort,
    private readonly serviceOrders: ServiceOrderPort,
  ) {}

  async findById(id: string): Promise<Billing> {
    const billing = await this.billings.findById(id);
    if (!billing) throw new BillingApplicationError('BILLING_NOT_FOUND');
    return billing;
  }

  async findByGatewayTransactionId(sessionId: string): Promise<Billing> {
    const billing = await this.billings.findByGatewayTransactionId(sessionId);
    if (!billing) throw new BillingApplicationError('BILLING_NOT_FOUND');
    return billing;
  }

  async requireServiceOrder(
    serviceOrderId: string,
  ): Promise<ServiceOrderSummary> {
    const serviceOrder = await this.serviceOrders.findById(serviceOrderId);
    if (!serviceOrder) {
      throw new BillingApplicationError('SERVICE_ORDER_NOT_FOUND');
    }
    return serviceOrder;
  }

  async persist(billing: Billing, expectedUpdatedAt: Date): Promise<Billing> {
    const updated = await this.billings.update(billing, expectedUpdatedAt);
    if (!updated) {
      throw new BillingApplicationError('BILLING_CONCURRENT_UPDATE');
    }
    return updated;
  }
}

import { BillingStatus } from '../../domain/enums/billing-status.enum';
import { BillingApplicationError } from '../errors/billing-application.error';
import { ServiceOrderPort } from '../ports/service-order.port';
import { BillingStore } from '../services/billing-store';

/** Entrega manual pela oficina: só com a cobrança quitada. */
export class DeliverBilledServiceOrderUseCase {
  constructor(
    private readonly store: BillingStore,
    private readonly serviceOrders: ServiceOrderPort,
  ) {}

  async execute(id: string): Promise<void> {
    const billing = await this.store.findById(id);
    if (billing.getStatus() !== BillingStatus.PAID) {
      throw new BillingApplicationError('BILLING_NOT_PAID');
    }
    await this.serviceOrders.deliver(billing.getServiceOrderId());
  }
}

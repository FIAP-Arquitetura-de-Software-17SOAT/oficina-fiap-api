import { Billing } from '../../domain/entities/billing.entity';
import { BillingApplicationError } from '../errors/billing-application.error';
import { BillingRepositoryPort } from '../ports/billing-repository.port';

export class FindBillingByServiceOrderUseCase {
  constructor(private readonly billings: BillingRepositoryPort) {}

  async execute(serviceOrderId: string): Promise<Billing> {
    const billing = await this.billings.findByServiceOrderId(
      serviceOrderId.trim(),
    );
    if (!billing) throw new BillingApplicationError('BILLING_NOT_FOUND');
    return billing;
  }
}

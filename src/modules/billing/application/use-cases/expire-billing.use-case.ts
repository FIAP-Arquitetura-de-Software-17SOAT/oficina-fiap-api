import { Billing } from '../../domain/entities/billing.entity';
import { BillingStore } from '../services/billing-store';

export class ExpireBillingUseCase {
  constructor(private readonly store: BillingStore) {}

  async execute(id: string): Promise<Billing> {
    const billing = await this.store.findById(id);
    const expectedUpdatedAt = new Date(billing.getUpdatedAt());
    billing.expire();
    return this.store.persist(billing, expectedUpdatedAt);
  }
}

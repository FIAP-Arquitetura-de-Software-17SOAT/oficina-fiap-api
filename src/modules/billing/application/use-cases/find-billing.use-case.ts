import { Billing } from '../../domain/entities/billing.entity';
import { BillingStore } from '../services/billing-store';

export class FindBillingUseCase {
  constructor(private readonly store: BillingStore) {}

  execute(id: string): Promise<Billing> {
    return this.store.findById(id);
  }
}

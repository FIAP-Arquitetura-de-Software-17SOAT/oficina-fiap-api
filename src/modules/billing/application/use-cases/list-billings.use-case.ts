import { Billing } from '../../domain/entities/billing.entity';
import { BillingRepositoryPort } from '../ports/billing-repository.port';

export class ListBillingsUseCase {
  constructor(private readonly billings: BillingRepositoryPort) {}

  execute(): Promise<Billing[]> {
    return this.billings.findAll();
  }
}

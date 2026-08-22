import { Billing } from '../src/modules/billing/entities/billing.entity';

export class InMemoryBillingRepository {
  private readonly billings = new Map<string, Billing>();

  create(billing: Billing): Promise<Billing> {
    this.billings.set(billing.getId(), billing);
    return Promise.resolve(billing);
  }

  findById(id: string): Promise<Billing | null> {
    return Promise.resolve(this.billings.get(id) ?? null);
  }

  findByServiceOrderId(serviceOrderId: string): Promise<Billing | null> {
    return Promise.resolve(
      Array.from(this.billings.values()).find(
        (billing) => billing.getServiceOrderId() === serviceOrderId,
      ) ?? null,
    );
  }

  findAll(): Promise<Billing[]> {
    return Promise.resolve(
      Array.from(this.billings.values()).sort(
        (a, b) => b.getCreatedAt().getTime() - a.getCreatedAt().getTime(),
      ),
    );
  }

  update(billing: Billing): Promise<Billing> {
    this.billings.set(billing.getId(), billing);
    return Promise.resolve(billing);
  }
}

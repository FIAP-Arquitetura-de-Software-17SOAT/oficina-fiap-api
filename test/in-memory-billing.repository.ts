import { Billing } from '../src/modules/billing/entities/billing.entity';

export class InMemoryBillingRepository {
  private readonly billings = new Map<string, Billing>();

  create(billing: Billing): Promise<Billing> {
    const persisted = this.clone(billing);
    this.billings.set(persisted.getId(), persisted);
    return Promise.resolve(this.clone(persisted));
  }

  findById(id: string): Promise<Billing | null> {
    const billing = this.billings.get(id);
    return Promise.resolve(billing ? this.clone(billing) : null);
  }

  findByServiceOrderId(serviceOrderId: string): Promise<Billing | null> {
    const billing = Array.from(this.billings.values()).find(
      (billing) => billing.getServiceOrderId() === serviceOrderId,
    );
    return Promise.resolve(billing ? this.clone(billing) : null);
  }

  findByGatewayTransactionId(
    gatewayTransactionId: string,
  ): Promise<Billing | null> {
    const billing = Array.from(this.billings.values()).find(
      (candidate) =>
        candidate.getGatewayTransactionId() === gatewayTransactionId,
    );
    return Promise.resolve(billing ? this.clone(billing) : null);
  }

  findAll(): Promise<Billing[]> {
    return Promise.resolve(
      Array.from(this.billings.values())
        .sort((a, b) => b.getCreatedAt().getTime() - a.getCreatedAt().getTime())
        .map((billing) => this.clone(billing)),
    );
  }

  update(billing: Billing, expectedUpdatedAt: Date): Promise<Billing | null> {
    const stored = this.billings.get(billing.getId());

    if (
      !stored ||
      stored.getUpdatedAt().getTime() !== expectedUpdatedAt.getTime()
    ) {
      return Promise.resolve(null);
    }

    const persisted = this.clone(billing);
    this.billings.set(persisted.getId(), persisted);
    return Promise.resolve(this.clone(persisted));
  }

  private clone(billing: Billing): Billing {
    return Billing.restore(billing.getId(), {
      serviceOrderId: billing.getServiceOrderId(),
      budgetId: billing.getBudgetId(),
      amount: billing.getAmount(),
      status: billing.getStatus(),
      paymentLink: billing.getPaymentLink(),
      gatewayTransactionId: billing.getGatewayTransactionId(),
      paymentMethod: billing.getPaymentMethod(),
      generatedAt: new Date(billing.getGeneratedAt()),
      paidAt: billing.getPaidAt() ? new Date(billing.getPaidAt()!) : null,
      expiresAt: billing.getExpiresAt()
        ? new Date(billing.getExpiresAt()!)
        : null,
      createdAt: new Date(billing.getCreatedAt()),
      updatedAt: new Date(billing.getUpdatedAt()),
    });
  }
}

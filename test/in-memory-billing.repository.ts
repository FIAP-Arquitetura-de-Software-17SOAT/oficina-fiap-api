import { Billing } from '../src/modules/billing/entities/billing.entity';
import { PaymentMethod } from '../src/modules/billing/enums/payment-method.enum';

export class InMemoryBillingRepository {
  private readonly billings = new Map<string, Billing>();
  private readonly checkoutSessionBillingIds = new Map<string, string>();
  private readonly checkoutSessionPayments = new Map<
    string,
    { paymentMethod: PaymentMethod; paidAt: Date }
  >();

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
    const billingId = this.checkoutSessionBillingIds.get(gatewayTransactionId);
    const billing = billingId ? this.billings.get(billingId) : undefined;
    return Promise.resolve(billing ? this.clone(billing) : null);
  }

  registerCheckoutSession(
    billingId: string,
    gatewayTransactionId: string,
  ): Promise<void> {
    this.checkoutSessionBillingIds.set(gatewayTransactionId, billingId);
    return Promise.resolve();
  }

  recordCheckoutSessionPayment(
    gatewayTransactionId: string,
    paymentMethod: PaymentMethod,
    paidAt: Date,
  ): Promise<void> {
    if (!this.checkoutSessionPayments.has(gatewayTransactionId)) {
      this.checkoutSessionPayments.set(gatewayTransactionId, {
        paymentMethod,
        paidAt: new Date(paidAt),
      });
    }
    return Promise.resolve();
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

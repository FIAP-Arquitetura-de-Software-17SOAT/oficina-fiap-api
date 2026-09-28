import { Billing } from '../../domain/entities/billing.entity';
import { BillingStatus } from '../../domain/enums/billing-status.enum';
import { BillingApplicationError } from '../errors/billing-application.error';
import { BillingStore } from '../services/billing-store';
import { PaymentLinkIssuer } from '../services/payment-link-issuer';

/**
 * Link vencido ganha um novo, com multa e juros sobre o valor original. O
 * valor da cobrança não muda; o que muda é quanto o gateway cobra.
 */
export class RenewPaymentLinkUseCase {
  constructor(
    private readonly store: BillingStore,
    private readonly linkIssuer: PaymentLinkIssuer,
  ) {}

  async execute(id: string, now = new Date()): Promise<Billing> {
    const billing = await this.store.findById(id);
    if (billing.getStatus() === BillingStatus.PAID) {
      throw new BillingApplicationError('BILLING_PAID_IS_TERMINAL');
    }

    const penalty = billing.calculatePenalty(now);
    if (!penalty) {
      throw new BillingApplicationError('PAYMENT_LINK_NOT_EXPIRED');
    }

    const expectedUpdatedAt = new Date(billing.getUpdatedAt());
    const link = await this.linkIssuer.issue({
      billingId: billing.getId(),
      serviceOrderId: billing.getServiceOrderId(),
      amountInCents: penalty.getTotalAmount().valueInCents,
    });
    billing.renewPaymentLink(link, now);

    return this.store.persist(billing, expectedUpdatedAt);
  }
}

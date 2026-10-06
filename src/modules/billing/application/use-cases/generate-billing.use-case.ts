import { Billing } from '../../domain/entities/billing.entity';
import { BillingStatus } from '../../domain/enums/billing-status.enum';
import { GenerateBillingInput } from '../contracts/billing.input';
import { BillingApplicationError } from '../errors/billing-application.error';
import { AcceptedBudgetPort } from '../ports/accepted-budget.port';
import { BillingNotifierPort } from '../ports/billing-notifier.port';
import { BillingRepositoryPort } from '../ports/billing-repository.port';
import { BillingStore } from '../services/billing-store';
import { PaymentLinkIssuer } from '../services/payment-link-issuer';

/**
 * Cria a cobrança e abre o link de pagamento em dois passos gravados
 * separadamente. Se o gateway falhar no meio, a cobrança fica `PENDING` e a
 * próxima chamada só refaz o link — não duplica a cobrança.
 */
export class GenerateBillingUseCase {
  constructor(
    private readonly billings: BillingRepositoryPort,
    private readonly store: BillingStore,
    private readonly acceptedBudgets: AcceptedBudgetPort,
    private readonly linkIssuer: PaymentLinkIssuer,
    private readonly notifier: BillingNotifierPort,
  ) {}

  async execute(input: GenerateBillingInput): Promise<Billing> {
    const serviceOrderId = input.serviceOrderId.trim();
    const serviceOrder = await this.store.requireServiceOrder(serviceOrderId);

    if (serviceOrder.status !== 'COMPLETED') {
      throw new BillingApplicationError('SERVICE_ORDER_NOT_COMPLETED');
    }

    const existing = await this.billings.findByServiceOrderId(serviceOrderId);
    if (existing) {
      if (existing.getStatus() === BillingStatus.PENDING) {
        return this.activate(existing);
      }
      throw new BillingApplicationError('BILLING_ALREADY_EXISTS');
    }

    const budget = await this.acceptedBudgets.findAccepted(serviceOrderId);
    if (!budget) {
      throw new BillingApplicationError('NO_ACCEPTED_BUDGET');
    }

    // Regra 14: o valor da cobrança é o total do orçamento aceito. Os dois
    // lados falam Money, então não há ida e volta por decimal no meio.
    const created = await this.billings.create(
      Billing.create({
        serviceOrderId,
        budgetId: budget.id,
        amount: budget.total,
      }),
    );

    return this.activate(created);
  }

  /** Abre o link, grava a cobrança aguardando pagamento e avisa o cliente. */
  private async activate(billing: Billing): Promise<Billing> {
    const link = await this.linkIssuer.issue({
      billingId: billing.getId(),
      serviceOrderId: billing.getServiceOrderId(),
      amountInCents: billing.getAmount().valueInCents,
    });
    const expectedUpdatedAt = new Date(billing.getUpdatedAt());
    billing.generatePaymentLink(link);
    const persisted = await this.store.persist(billing, expectedUpdatedAt);

    void this.notifier.paymentLinkReady({
      serviceOrderId: persisted.getServiceOrderId(),
      total: persisted.getAmount().value,
      paymentLink: link.paymentLink,
    });

    return persisted;
  }
}

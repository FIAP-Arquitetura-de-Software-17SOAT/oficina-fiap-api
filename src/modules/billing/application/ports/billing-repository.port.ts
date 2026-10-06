import { Billing } from '../../domain/entities/billing.entity';
import { PaymentMethod } from '../../domain/enums/payment-method.enum';

/**
 * A implementação traduz a unicidade de `serviceOrderId` em
 * `BILLING_ALREADY_EXISTS`: uma OS tem no máximo uma cobrança.
 */
export abstract class BillingRepositoryPort {
  abstract create(billing: Billing): Promise<Billing>;
  abstract findById(id: string): Promise<Billing | null>;
  abstract findByServiceOrderId(
    serviceOrderId: string,
  ): Promise<Billing | null>;
  /** Cobrança dona de uma sessão de checkout, atual ou de um link anterior. */
  abstract findByGatewayTransactionId(
    gatewayTransactionId: string,
  ): Promise<Billing | null>;
  abstract findAll(): Promise<Billing[]>;
  /**
   * Gravada antes da cobrança mudar de estado: se a persistência falhar depois,
   * o webhook dessa sessão ainda encontra a cobrança.
   */
  abstract registerCheckoutSession(
    billingId: string,
    gatewayTransactionId: string,
  ): Promise<void>;
  /** Idempotente: a primeira confirmação de cada sessão fica, as outras não sobrescrevem. */
  abstract recordCheckoutSessionPayment(
    gatewayTransactionId: string,
    paymentMethod: PaymentMethod,
    paidAt: Date,
  ): Promise<void>;
  /** Compare-and-set por `updatedAt`; `null` quando outra requisição gravou antes. */
  abstract update(
    billing: Billing,
    expectedUpdatedAt: Date,
  ): Promise<Billing | null>;
}

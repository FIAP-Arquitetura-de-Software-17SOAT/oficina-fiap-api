import { Billing } from '../../domain/entities/billing.entity';
import { ServiceOrderSummary } from '../ports/service-order.port';

export interface GenerateBillingInput {
  serviceOrderId: string;
}

/** Estado da cobrança e da OS depois de processar um retorno do gateway. */
export interface PaymentReturn {
  billing: Billing;
  serviceOrder: ServiceOrderSummary;
}

import { Money } from '../../../../shared/domain/value-objects/money.vo';
import { Billing } from '../../domain/entities/billing.entity';
import { BillingStatus } from '../../domain/enums/billing-status.enum';
import { PaymentMethod } from '../../domain/enums/payment-method.enum';

export type BillingRecord = {
  id: string;
  serviceOrderId: string;
  budgetId: string;
  status: string;
  amountCents: number;
  paymentLink: string | null;
  gatewayTransactionId: string | null;
  paymentMethod: string | null;
  generatedAt: Date;
  paidAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Dinheiro é gravado em centavos inteiros; o domínio só conhece `Money`. */
export class BillingPersistenceMapper {
  static toPersistence(billing: Billing) {
    return {
      id: billing.getId(),
      serviceOrderId: billing.getServiceOrderId(),
      budgetId: billing.getBudgetId(),
      ...BillingPersistenceMapper.toUpdate(billing),
      createdAt: billing.getCreatedAt(),
    };
  }

  static toUpdate(billing: Billing) {
    return {
      status: billing.getStatus(),
      amountCents: billing.getAmount().valueInCents,
      paymentLink: billing.getPaymentLink(),
      gatewayTransactionId: billing.getGatewayTransactionId(),
      paymentMethod: billing.getPaymentMethod(),
      generatedAt: billing.getGeneratedAt(),
      paidAt: billing.getPaidAt(),
      expiresAt: billing.getExpiresAt(),
      updatedAt: billing.getUpdatedAt(),
    };
  }

  static toDomain(record: BillingRecord): Billing {
    return Billing.restore(record.id, {
      serviceOrderId: record.serviceOrderId,
      budgetId: record.budgetId,
      amount: Money.fromCents(record.amountCents),
      status: record.status as BillingStatus,
      paymentLink: record.paymentLink,
      gatewayTransactionId: record.gatewayTransactionId,
      paymentMethod: record.paymentMethod as PaymentMethod | null,
      generatedAt: record.generatedAt,
      paidAt: record.paidAt,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}

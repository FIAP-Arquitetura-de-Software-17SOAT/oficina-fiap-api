import {
  BillingPenaltyResponseDto,
  BillingResponseDto,
  PaymentReturnResponseDto,
} from '../dto/billing.dto';
import { PaymentReturn } from '../services/billing.service';
import { Money } from '../../../shared/domain/value-objects/money.vo';
import { Billing } from '../entities/billing.entity';
import { BillingStatus } from '../enums/billing-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';

type BillingRecord = {
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

export class BillingMapper {
  static toPaymentReturnResponse(
    result: PaymentReturn,
  ): PaymentReturnResponseDto {
    return {
      billingId: result.billing.getId(),
      serviceOrderId: result.serviceOrder.getId(),
      billingStatus: result.billing.getStatus(),
      serviceOrderStatus: result.serviceOrder.getStatus(),
      paymentLink: result.billing.getPaymentLink(),
    };
  }

  static toPersistence(billing: Billing) {
    return {
      id: billing.getId(),
      serviceOrderId: billing.getServiceOrderId(),
      budgetId: billing.getBudgetId(),
      status: billing.getStatus(),
      amountCents: billing.getAmount().valueInCents,
      paymentLink: billing.getPaymentLink(),
      gatewayTransactionId: billing.getGatewayTransactionId(),
      paymentMethod: billing.getPaymentMethod(),
      generatedAt: billing.getGeneratedAt(),
      paidAt: billing.getPaidAt(),
      expiresAt: billing.getExpiresAt(),
      createdAt: billing.getCreatedAt(),
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

  static toResponse(
    billing: Billing,
    calculatedAt = new Date(),
  ): BillingResponseDto {
    const penalty = billing.calculatePenalty(calculatedAt);

    return {
      id: billing.getId(),
      serviceOrderId: billing.getServiceOrderId(),
      budgetId: billing.getBudgetId(),
      status: billing.getStatus(),
      amount: billing.getAmount().value,
      amountDue: penalty
        ? penalty.getTotalAmount().value
        : billing.getAmount().value,
      paymentLink: billing.getPaymentLink(),
      gatewayTransactionId: billing.getGatewayTransactionId(),
      paymentMethod: billing.getPaymentMethod(),
      generatedAt: billing.getGeneratedAt(),
      paidAt: billing.getPaidAt(),
      expiresAt: billing.getExpiresAt(),
      penalty: penalty ? BillingMapper.toPenaltyResponse(penalty) : null,
      createdAt: billing.getCreatedAt(),
      updatedAt: billing.getUpdatedAt(),
    };
  }

  static toResponseList(billings: Billing[]): BillingResponseDto[] {
    return billings.map((billing) => BillingMapper.toResponse(billing));
  }

  private static toPenaltyResponse(
    penalty: NonNullable<ReturnType<Billing['calculatePenalty']>>,
  ): BillingPenaltyResponseDto {
    return {
      originalAmount: penalty.getOriginalAmount().value,
      fixedPenaltyAmount: penalty.getFixedPenaltyAmount().value,
      interestAmount: penalty.getInterestAmount().value,
      overdueDays: penalty.getOverdueDays(),
      totalAmount: penalty.getTotalAmount().value,
      calculatedAt: penalty.getCalculatedAt(),
    };
  }
}

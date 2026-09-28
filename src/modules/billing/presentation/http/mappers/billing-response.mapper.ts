import { ServiceOrderStatus } from '../../../../service-order/domain/enums/service-order-status.enum';
import { PaymentReturn } from '../../../application/contracts/billing.input';
import { Billing } from '../../../domain/entities/billing.entity';
import {
  BillingPenaltyResponseDto,
  BillingResponseDto,
  PaymentReturnResponseDto,
} from '../dto/billing.dto';

export class BillingResponseMapper {
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
      penalty: penalty
        ? BillingResponseMapper.toPenaltyResponse(penalty)
        : null,
      createdAt: billing.getCreatedAt(),
      updatedAt: billing.getUpdatedAt(),
    };
  }

  static toResponseList(billings: Billing[]): BillingResponseDto[] {
    return billings.map((billing) => BillingResponseMapper.toResponse(billing));
  }

  static toPaymentReturnResponse(
    result: PaymentReturn,
  ): PaymentReturnResponseDto {
    return {
      billingId: result.billing.getId(),
      serviceOrderId: result.serviceOrder.id,
      billingStatus: result.billing.getStatus(),
      serviceOrderStatus: result.serviceOrder.status as ServiceOrderStatus,
      paymentLink: result.billing.getPaymentLink(),
    };
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

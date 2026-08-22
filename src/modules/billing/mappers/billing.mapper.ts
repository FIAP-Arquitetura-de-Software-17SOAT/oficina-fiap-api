import { BillingResponseDto } from '../dto/billing.dto';
import { Billing, BillingProps } from '../entities/billing.entity';
import { BillingStatus } from '../enums/billing-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';

type BillingRecord = {
  id: string;
  serviceOrderId: string;
  status: string;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  createdAt: Date;
  updatedAt: Date;
  payments: Array<{
    id: string;
    billingId: string;
    amountCents: number;
    method: string;
    paidAt: Date;
    createdAt: Date;
  }>;
};

export class BillingMapper {
  static toPersistence(billing: Billing) {
    return {
      id: billing.getId(),
      serviceOrderId: billing.getServiceOrderId(),
      status: billing.getStatus(),
      totalCents: billing.getTotalAmountInCents(),
      paidCents: billing.getPaidAmountInCents(),
      balanceCents: billing.getBalanceAmountInCents(),
      createdAt: billing.getCreatedAt(),
      updatedAt: billing.getUpdatedAt(),
      payments: {
        create: billing.getPayments().map((payment) => ({
          id: payment.getId(),
          amountCents: payment.getAmount().valueInCents,
          method: payment.getMethod(),
          paidAt: payment.getPaidAt(),
          createdAt: payment.getCreatedAt(),
        })),
      },
    };
  }

  static toDomain(record: BillingRecord): Billing {
    const props: BillingProps = {
      serviceOrderId: record.serviceOrderId,
      totalAmountInCents: record.totalCents,
      status: record.status as BillingStatus,
      payments: record.payments.map((payment) => ({
        id: payment.id,
        amountInCents: payment.amountCents,
        method: payment.method as PaymentMethod,
        paidAt: payment.paidAt,
        createdAt: payment.createdAt,
      })),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };

    return Billing.restore(record.id, props);
  }

  static toResponse(billing: Billing): BillingResponseDto {
    return {
      id: billing.getId(),
      serviceOrderId: billing.getServiceOrderId(),
      status: billing.getStatus(),
      totalAmount: billing.getTotalAmountInCents() / 100,
      paidAmount: billing.getPaidAmountInCents() / 100,
      balanceAmount: billing.getBalanceAmountInCents() / 100,
      createdAt: billing.getCreatedAt(),
      updatedAt: billing.getUpdatedAt(),
      payments: billing.getPayments().map((payment) => ({
        id: payment.getId(),
        amount: payment.getAmount().value,
        method: payment.getMethod(),
        paidAt: payment.getPaidAt(),
        createdAt: payment.getCreatedAt(),
      })),
    };
  }

  static toResponseList(billings: Billing[]): BillingResponseDto[] {
    return billings.map((billing) => BillingMapper.toResponse(billing));
  }
}

import { ApiProperty } from '@nestjs/swagger';
import { BillingStatus } from '../enums/billing-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';

export class BillingPaymentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 120 })
  amount: number;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.PIX })
  method: PaymentMethod;

  @ApiProperty({ type: String, format: 'date-time' })
  paidAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;
}

export class BillingResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  serviceOrderId: string;

  @ApiProperty({ enum: BillingStatus, example: BillingStatus.OPEN })
  status: BillingStatus;

  @ApiProperty({ example: 120 })
  totalAmount: number;

  @ApiProperty({ example: 70 })
  paidAmount: number;

  @ApiProperty({ example: 50 })
  balanceAmount: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;

  @ApiProperty({ type: [BillingPaymentResponseDto] })
  payments: BillingPaymentResponseDto[];
}

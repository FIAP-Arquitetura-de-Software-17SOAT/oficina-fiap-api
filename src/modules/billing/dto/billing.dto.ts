import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { BillingStatus } from '../enums/billing-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class GenerateBillingDto {
  @ApiProperty({ format: 'uuid' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  serviceOrderId: string;
}

export class FindBillingQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  serviceOrderId?: string;
}

export class BillingPenaltyResponseDto {
  @ApiProperty({ example: 100 })
  originalAmount: number;

  @ApiProperty({ example: 2 })
  fixedPenaltyAmount: number;

  @ApiProperty({ example: 0.03 })
  interestAmount: number;

  @ApiProperty({ example: 1 })
  overdueDays: number;

  @ApiProperty({ example: 102.03 })
  totalAmount: number;

  @ApiProperty({ type: String, format: 'date-time' })
  calculatedAt: Date;
}

export class BillingResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  serviceOrderId: string;

  @ApiProperty({ format: 'uuid' })
  budgetId: string;

  @ApiProperty({ enum: BillingStatus, example: BillingStatus.WAITING_PAYMENT })
  status: BillingStatus;

  @ApiProperty({ example: 120 })
  amount: number;

  @ApiPropertyOptional({
    example: 'https://checkout.stripe.com/c/pay/cs_test_123',
  })
  paymentLink: string | null;

  @ApiPropertyOptional({ example: 'cs_test_123' })
  gatewayTransactionId: string | null;

  @ApiPropertyOptional({ enum: PaymentMethod, example: PaymentMethod.CARD })
  paymentMethod: PaymentMethod | null;

  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  paidAt: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  expiresAt: Date | null;

  @ApiPropertyOptional({ type: BillingPenaltyResponseDto })
  penalty: BillingPenaltyResponseDto | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

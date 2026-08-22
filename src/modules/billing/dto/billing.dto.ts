import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { BillingStatus } from '../enums/billing-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class GenerateBillingDto {
  @ApiProperty({ format: 'uuid' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  serviceOrderId: string;
}

export class FindBillingQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  serviceOrderId?: string;
}

export class RegisterPaymentDto {
  @ApiProperty({ example: 120, minimum: 0.01, maximum: 99_999_999.99 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99_999_999.99)
  amount: number;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.PIX })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;
}

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

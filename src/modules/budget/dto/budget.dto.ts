import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  ArrayNotEmpty,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { BudgetItemType, BudgetStatus } from '../entities/budget.entity';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class FindBudgetsQueryDto {
  @ApiProperty({ example: 'service-123' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  serviceOrderId: string;
}

export class CreateBudgetItemDto {
  @ApiProperty({ example: 'Oil change' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ enum: BudgetItemType, example: BudgetItemType.SERVICE })
  @IsEnum(BudgetItemType)
  type: BudgetItemType;

  @ApiProperty({ example: 1, minimum: 0.01 })
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @ApiProperty({ example: 120, minimum: 0.01 })
  @IsNumber()
  @Min(0.01)
  unitPrice: number;
}

export class CreateBudgetDto {
  @ApiProperty({ example: 'service-123' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  serviceOrderId: string;

  @ApiProperty({ type: [CreateBudgetItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateBudgetItemDto)
  items: CreateBudgetItemDto[];
}

export class BudgetItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Oil change' })
  description: string;

  @ApiProperty({ enum: BudgetItemType, example: BudgetItemType.SERVICE })
  type: BudgetItemType;

  @ApiProperty({ example: 1 })
  quantity: number;

  @ApiProperty({ example: 120 })
  unitPrice: number;

  @ApiProperty({ example: 120 })
  subtotal: number;
}

export class BudgetTotalResponseDto {
  @ApiProperty({ format: 'uuid' })
  budgetId: string;

  @ApiProperty({ example: 120 })
  totalAmount: number;
}

export class RefuseBudgetDto {
  @ApiProperty({ example: 'Customer found it expensive' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class BudgetResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'service-123' })
  serviceOrderId: string;

  @ApiProperty({ example: 1 })
  version: number;

  @ApiProperty({ enum: BudgetStatus, example: BudgetStatus.GENERATED })
  status: BudgetStatus;

  @ApiProperty({ example: 120 })
  totalAmount: number;

  @ApiPropertyOptional({
    example: 'Customer found it expensive',
    nullable: true,
  })
  refusalReason: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  sentAt: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  answeredAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;

  @ApiProperty({ type: [BudgetItemResponseDto] })
  items: BudgetItemResponseDto[];
}

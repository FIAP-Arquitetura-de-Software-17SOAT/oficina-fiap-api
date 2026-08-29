import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  ArrayNotEmpty,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { BudgetItemType, BudgetStatus } from '../entities/budget.entity';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class FindBudgetsByServiceOrderParamsDto {
  @ApiProperty({ example: 'service-123' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  serviceOrderId: string;
}

export class CreateBudgetItemDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Peca referenciada pelo item. Obrigatorio para itens do tipo PART serem ' +
      'solicitados ao estoque quando o orcamento for aceito.',
  })
  @IsOptional()
  @IsUUID()
  partId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Servico do catalogo referenciado pelo item. So e aceito em itens do ' +
      'tipo SERVICE. Descricao e preco continuam sendo copia do momento do ' +
      'orcamento.',
  })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiProperty({ example: 'Oil change' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ enum: BudgetItemType, example: BudgetItemType.SERVICE })
  @IsEnum(BudgetItemType)
  type: BudgetItemType;

  @ApiProperty({ example: 1, minimum: 0.01, maximum: 99_999_999.99 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99_999_999.99)
  quantity: number;

  @ApiProperty({ example: 120, minimum: 0.01, maximum: 99_999_999.99 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99_999_999.99)
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

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  partId: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  serviceId: string | null;

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

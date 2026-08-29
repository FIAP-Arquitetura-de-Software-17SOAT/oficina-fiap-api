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

/**
 * Filtro da listagem. Antes o recorte por OS era a sub-rota
 * `GET /budgets/service-orders/:serviceOrderId`, que ficava ao lado de
 * `GET /budgets/:id` e só não colidia por ordem de declaração — e a query
 * string, que é como o resto da API filtra, era ignorada em silêncio: pedir
 * `?serviceOrderId=X` devolvia 200 com a listagem inteira.
 *
 * Query string também é o que combina com a modelagem: orçamento e OS são
 * agregados distintos ligados por identidade (a FK foi removida em
 * 20260829150000_budget_service_order_external_ref), então a OS filtra o
 * orçamento, não o contém.
 */
export class FindBudgetsQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    example: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
    description:
      'Recorta a listagem para os orçamentos de uma ordem de serviço',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  serviceOrderId?: string;
}

export class CreateBudgetItemDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Peça do estoque referenciada pelo item. Obrigatório em itens do tipo ' +
      'PART — é por ela que a peça é baixada quando o orçamento é aceito — e ' +
      'recusado em itens do tipo SERVICE.',
  })
  @IsOptional()
  @IsUUID()
  partId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Serviço do catálogo referenciado pelo item. Só é aceito em itens do ' +
      'tipo SERVICE. Descrição e preço continuam sendo cópia do momento do ' +
      'orçamento.',
  })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiProperty({ example: 'Troca de óleo' })
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
  @ApiProperty({
    format: 'uuid',
    example: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsUUID()
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

  @ApiProperty({ example: 'Troca de óleo' })
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
  @ApiProperty({ example: 'Cliente achou caro' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class BudgetResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    format: 'uuid',
    example: '4f3b2a10-7c5d-4e8f-9a1b-2c3d4e5f6a7b',
  })
  serviceOrderId: string;

  @ApiProperty({ example: 1 })
  version: number;

  @ApiProperty({ enum: BudgetStatus, example: BudgetStatus.GENERATED })
  status: BudgetStatus;

  @ApiProperty({ example: 120 })
  totalAmount: number;

  @ApiPropertyOptional({
    example: 'Cliente achou caro',
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

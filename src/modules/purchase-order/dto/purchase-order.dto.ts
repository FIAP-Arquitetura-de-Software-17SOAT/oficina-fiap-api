import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';

import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class AddPurchaseOrderItemDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  partId!: string;

  @ApiProperty({
    example: 2,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({
    example: 150.5,
    minimum: 0,
  })
  @IsNumber({
    maxDecimalPlaces: 2,
  })
  @Min(0)
  unitPrice!: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty({
    example: 'PC-2026-0042',
  })
  @IsString()
  @IsNotEmpty()
  number!: string;

  @ApiProperty({
    example: 'Auto Peças São Paulo',
  })
  @IsString()
  @IsNotEmpty()
  supplier!: string;
}

export class ShortageItemDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  partId!: string;

  @ApiProperty({
    example: 2,
    minimum: 1,
    description: 'Quantidade faltante para atender a ordem de servico.',
  })
  @IsInt()
  @Min(1)
  quantity!: number;
}

/**
 * Entrada da politica "quando o estoque for consultado, caso nao tenha pecas
 * suficientes, registrar a necessidade de compra". O numero do pedido e o preco
 * unitario saem do proprio dominio: o numero e sequencial e o preco vem do
 * cadastro da peca.
 */
export class RegisterShortageDto {
  @ApiPropertyOptional({
    example: 'Auto Pecas Sao Paulo',
    description: 'Fornecedor. Fica "A definir" quando o pedido nasce da falta.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  supplier?: string;

  @ApiProperty({ type: [ShortageItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ShortageItemDto)
  items!: ShortageItemDto[];
}

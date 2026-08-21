import { ApiProperty } from '@nestjs/swagger';

import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class AddPurchaseOrderItemDto {
  @ApiProperty({
    format: 'uuid',
    example:
      '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  pecaId!: string;

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
    example:
      'Auto Peças São Paulo',
  })
  @IsString()
  @IsNotEmpty()
  supplier!: string;
}
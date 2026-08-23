import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { MeasurementUnit, PartType } from '../entities/part.entity';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreatePartDto {
  @ApiProperty({ example: 'OIL-FILTER-123' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'Oil filter' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Filter for engine oil' })
  @Transform(trim)
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ enum: PartType, example: PartType.PART })
  @IsEnum(PartType)
  type: PartType;

  @ApiProperty({ enum: MeasurementUnit, example: MeasurementUnit.UNIT })
  @IsEnum(MeasurementUnit)
  unit: MeasurementUnit;

  @ApiProperty({
    example: 149.9,
    minimum: 0,
    description:
      'Valor em decimal, com até duas casas. É convertido para centavos ' +
      'inteiros no domínio e no banco.',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice: number;

  @ApiProperty({ example: 3, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimumQuantity: number;
}

export class UpdatePartDto {
  @ApiPropertyOptional({ example: 'OIL-FILTER-123' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ example: 'Oil filter' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'Filter for engine oil', nullable: true })
  @Transform(trim)
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: PartType, example: PartType.PART })
  @IsEnum(PartType)
  @IsOptional()
  type?: PartType;

  @ApiPropertyOptional({ enum: MeasurementUnit, example: MeasurementUnit.UNIT })
  @IsEnum(MeasurementUnit)
  @IsOptional()
  unit?: MeasurementUnit;

  @ApiPropertyOptional({
    example: 149.9,
    minimum: 0,
    description:
      'Valor em decimal, com até duas casas. É convertido para centavos ' +
      'inteiros no domínio e no banco.',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  unitPrice?: number;

  @ApiPropertyOptional({ example: 3, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  minimumQuantity?: number;
}

export class PartResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'OIL-FILTER-123' })
  code: string;

  @ApiProperty({ example: 'Oil filter' })
  name: string;

  @ApiPropertyOptional({ example: 'Filter for engine oil' })
  description?: string;

  @ApiProperty({ enum: PartType, example: PartType.PART })
  type: PartType;

  @ApiProperty({ enum: MeasurementUnit, example: MeasurementUnit.UNIT })
  unit: MeasurementUnit;

  @ApiProperty({ example: 149.9 })
  unitPrice: number;

  @ApiProperty({ example: 10 })
  quantity: number;

  @ApiProperty({ example: 3 })
  minimumQuantity: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateServiceDto {
  @ApiProperty({ example: 'Troca de óleo e filtro' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({
    example: 'Inclui óleo sintético 5W30 e substituição do filtro.',
  })
  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    example: 149.9,
    description:
      'Valor em decimal, com até duas casas. É convertido para centavos ' +
      'inteiros no domínio e no banco.',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price: number;
}

export class UpdateServiceDto {
  @ApiPropertyOptional({ example: 'Troca de óleo e filtro' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    example: 'Inclui óleo sintético 5W30.',
    description: 'String vazia limpa a descrição.',
  })
  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 169.9 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @IsOptional()
  price?: number;
}

export class ServiceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Troca de óleo e filtro' })
  name: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Inclui óleo sintético 5W30 e substituição do filtro.',
  })
  description: string | null;

  @ApiProperty({ example: 149.9 })
  price: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

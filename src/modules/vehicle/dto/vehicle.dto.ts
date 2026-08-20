import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateVehicleDto {
  @ApiProperty({ format: 'uuid', description: 'Cliente dono do veículo' })
  @IsUUID()
  clientId: string;

  @ApiProperty({
    example: 'ABC1D23',
    description:
      'Placa no formato antigo (ABC1234) ou Mercosul (ABC1D23). Aceita com hífen ou minúsculas; é persistida normalizada.',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  plate: string;

  @ApiProperty({ example: 'Fiat' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  brand: string;

  @ApiProperty({ example: 'Argo' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  model: string;

  @ApiProperty({ example: 2022, description: 'Entre 1900 e o ano que vem' })
  @Type(() => Number)
  @IsInt()
  year: number;
}

/**
 * `plate` e `clientId` ficam de fora de propósito: identificam o veículo e não
 * mudam depois do cadastro. Com `forbidNonWhitelisted` ligado, enviá-los dá 400.
 */
export class UpdateVehicleDto {
  @ApiPropertyOptional({ example: 'Fiat' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  brand?: string;

  @ApiPropertyOptional({ example: 'Argo' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  model?: string;

  @ApiPropertyOptional({ example: 2022 })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  year?: number;
}

export class ListVehicleQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filtra os veículos de um cliente',
  })
  @IsUUID()
  @IsOptional()
  clientId?: string;
}

export class VehicleResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  clientId: string;

  @ApiProperty({ example: 'ABC1D23', description: 'Sem hífen, em maiúsculas' })
  plate: string;

  @ApiProperty({ example: 'Fiat' })
  brand: string;

  @ApiProperty({ example: 'Argo' })
  model: string;

  @ApiProperty({ example: 2022 })
  year: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

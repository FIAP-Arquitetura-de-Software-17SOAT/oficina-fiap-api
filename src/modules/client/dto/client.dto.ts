import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateClientDto {
  @ApiProperty({ example: 'Maria Silva' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: '529.982.247-25',
    description:
      'CPF ou CNPJ do cliente. Aceita com ou sem máscara; é persistido apenas com dígitos.',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  document: string;

  @ApiProperty({
    example: 'maria@example.com',
    description: 'Normalizado para minúsculas.',
  })
  @Transform(trim)
  @IsEmail()
  email: string;

  @ApiProperty({
    example: '(11) 99999-8888',
    description:
      'Telefone com DDD. Aceita com ou sem máscara; é persistido apenas com dígitos.',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  phone: string;
}

/**
 * `document` não entra aqui de propósito: é o identificador do cliente no
 * domínio e não muda depois do cadastro. Com `forbidNonWhitelisted` ligado,
 * enviá-lo resulta em 400.
 */
export class UpdateClientDto {
  @ApiPropertyOptional({ example: 'Maria Silva' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'maria@example.com' })
  @Transform(trim)
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: '(11) 99999-8888' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  phone?: string;
}

export class ClientResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Maria Silva' })
  name: string;

  @ApiProperty({ example: '52998224725', description: 'Apenas dígitos' })
  document: string;

  @ApiProperty({ example: 'maria@example.com' })
  email: string;

  @ApiProperty({ example: '11999998888', description: 'Apenas dígitos' })
  phone: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

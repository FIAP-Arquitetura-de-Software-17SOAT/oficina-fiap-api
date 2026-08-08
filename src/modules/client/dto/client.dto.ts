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

  @ApiProperty({ example: '12345678901', description: 'CPF, apenas dígitos' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  document: string;

  @ApiProperty({ example: 'maria@example.com' })
  @Transform(trim)
  @IsEmail()
  email: string;

  @ApiProperty({ example: '11999998888' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  phone: string;
}

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

  @ApiPropertyOptional({ example: '11999998888' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  phone?: string;
}

export class ClientResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  document: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  phone: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateStockMovementDto {
  @ApiProperty({ example: 2, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({
    example: '5ee0df9c-01b5-4fba-a02a-9d859557da83',
    description: 'Unique key generated once by the caller for safe retries.',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;
}

export class StockMovementResponseDto {
  @ApiProperty({ example: 'movement-id' })
  id: string;

  @ApiProperty({ example: 'request-1' })
  idempotencyKey: string;

  @ApiProperty({ enum: ['IN', 'OUT'] })
  type: 'IN' | 'OUT';

  @ApiProperty({ example: 2 })
  quantity: number;

  @ApiProperty({ format: 'uuid' })
  partId: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

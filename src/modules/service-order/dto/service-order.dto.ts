import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class OpenServiceOrderDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Id do cliente dono da ordem de serviço',
  })
  @Transform(trim)
  @IsUUID()
  clientId: string;

  @ApiProperty({
    example: 'a1b2c3d4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
    description:
      'Id do veículo. Precisa existir e pertencer ao cliente informado.',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  vehicleId: string;

  @ApiProperty({ example: 'Barulho no motor ao acelerar' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  description: string;
}

export class AssignMechanicDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Id do mecânico que assume a OS. Atribuir move a OS para IN_DIAGNOSIS ' +
      'e inicia o timer de execução.',
  })
  @Transform(trim)
  @IsUUID()
  mechanicId: string;
}

export class CancelServiceOrderDto {
  @ApiProperty({ example: 'Cliente desistiu do serviço' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class ServiceOrderResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  clientId: string;

  @ApiProperty()
  vehicleId: string;

  @ApiProperty()
  description: string;

  @ApiProperty({
    enum: [
      'RECEIVED',
      'IN_DIAGNOSIS',
      'AWAITING_APPROVAL',
      'AWAITING_PARTS',
      'IN_PROGRESS',
      'COMPLETED',
      'DELIVERED',
      'CANCELLED',
    ],
  })
  status: string;

  @ApiProperty({ nullable: true, type: String })
  cancellationReason: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  mechanicId: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Início do timer: quando a OS foi atribuída ao mecânico.',
  })
  assignedAt: Date | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Quando o estoque registrou que atendeu a OS. Nulo enquanto as peças ' +
      'não forem despachadas — e sem isso a OS não entra em execução.',
  })
  partsDispatchedAt: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  completedAt: Date | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'assignedAt até completedAt, em milissegundos.',
  })
  executionTimeMs: number | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

export class AverageExecutionTimeResponseDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Tempo médio de execução em milissegundos (assignedAt até completedAt) das OS finalizadas que passaram por atribuição a um mecânico. Null se ainda não há amostra.',
  })
  averageExecutionTimeMs: number | null;

  @ApiProperty({
    description: 'Quantidade de OS finalizadas consideradas no cálculo',
  })
  sampleSize: number;
}

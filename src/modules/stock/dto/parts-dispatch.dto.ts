import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PartRequirementDto {
  @ApiProperty({ format: 'uuid' })
  partId: string;

  @ApiProperty({ example: 'Filtro de óleo' })
  partName: string;

  @ApiProperty({
    example: 3,
    description:
      'Quantidade que o orçamento aceito exige, arredondada para cima.',
  })
  required: number;

  @ApiProperty({ example: 1, description: 'Saldo no momento da consulta.' })
  available: number;
}

export class PartsDispatchResponseDto {
  @ApiProperty({ format: 'uuid' })
  serviceOrderId: string;

  @ApiProperty({
    example: true,
    description:
      'true quando o estoque foi baixado e a OS avançou para EM_EXECUCAO; ' +
      'false quando faltou peça e um pedido de compra foi aberto.',
  })
  dispatched: boolean;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Pedido de compra aberto pela falta de peças.',
  })
  purchaseOrderId: string | null;

  @ApiProperty({ type: [PartRequirementDto] })
  requirements: PartRequirementDto[];
}

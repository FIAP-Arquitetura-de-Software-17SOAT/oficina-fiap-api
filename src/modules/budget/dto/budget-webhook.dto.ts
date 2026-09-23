import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export enum BudgetDecision {
  APPROVED = 'APPROVED',
  REFUSED = 'REFUSED',
}

/**
 * Notificação que um sistema externo (assinatura eletrônica, portal, email
 * com link) manda quando o cliente responde o orçamento.
 */
export class BudgetDecisionWebhookDto {
  @ApiProperty({ format: 'uuid', description: 'Orçamento respondido' })
  @IsUUID()
  budgetId: string;

  @ApiProperty({ enum: BudgetDecision, example: BudgetDecision.APPROVED })
  @IsEnum(BudgetDecision)
  decision: BudgetDecision;

  @ApiPropertyOptional({
    example: 'Achei caro',
    description: 'Motivo da recusa. Obrigatório quando decision = REFUSED.',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  reason?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export enum BudgetDecision {
  APPROVED = 'APPROVED',
  REFUSED = 'REFUSED',
}

/**
 * Resposta do cliente ao orçamento, vinda do link do email: a página de
 * confirmação posta aqui o token do link e a decisão.
 */
export class BudgetDecisionWebhookDto {
  @ApiProperty({
    description:
      'Token do link de aprovação que o cliente recebeu no email do ' +
      'orçamento. É a prova de que a resposta veio de quem recebeu o email; ' +
      'o id do orçamento sozinho não autoriza nada.',
    example: 'q3Jm1xVb0c9yZ8Q2kPp7T4wL6sE5nR1aHdUfGiKoXjM',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

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

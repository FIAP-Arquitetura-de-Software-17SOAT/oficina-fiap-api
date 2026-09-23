import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
  forwardRef,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../../../shared/http/auth/public.decorator';
import { BudgetResponseDto } from '../dto/budget.dto';
import { BudgetDecisionWebhookDto } from '../dto/budget-webhook.dto';
import { BudgetMapper } from '../mappers/budget.mapper';
import { BudgetService } from '../services/budget.service';
import {
  BUDGET_WEBHOOK_SIGNATURE_HEADER,
  BUDGET_WEBHOOK_TIMESTAMP_HEADER,
  BudgetWebhookSignatureGuard,
} from '../webhooks/budget-webhook-signature.guard';

/**
 * Controller à parte porque o BudgetController exige ADMIN/EMPLOYEE na classe
 * inteira, e quem chama o webhook é um sistema, sem token: a autenticação é a
 * assinatura HMAC, conferida pelo guard.
 */
@ApiTags('budgets')
@Public()
@Controller('budgets/webhooks')
export class BudgetWebhookController {
  constructor(
    @Inject(forwardRef(() => BudgetService))
    private readonly budgetService: BudgetService,
  ) {}

  @Post('decision')
  @HttpCode(HttpStatus.OK)
  @UseGuards(BudgetWebhookSignatureGuard)
  @ApiOperation({
    summary: 'Recebe a aprovação ou recusa do orçamento vinda de fora',
    description:
      'Autenticado por assinatura, não por token: sha256= + HMAC-SHA256 (hex) ' +
      'de "<timestamp>.<corpo bruto>" com BUDGET_WEBHOOK_SECRET. O timestamp ' +
      '(unix, segundos) vale por 5 minutos. Reentregar a mesma decisão ' +
      'devolve 200 sem repetir efeitos.',
  })
  @ApiHeader({
    name: BUDGET_WEBHOOK_TIMESTAMP_HEADER,
    required: true,
    description: 'Unix timestamp (segundos) usado na assinatura',
  })
  @ApiHeader({
    name: BUDGET_WEBHOOK_SIGNATURE_HEADER,
    required: true,
    description: 'sha256=<hex do HMAC-SHA256 de "<timestamp>.<corpo>">',
  })
  @ApiOkResponse({ type: BudgetResponseDto })
  @ApiBadRequestResponse({
    description: 'Corpo inválido, recusa sem motivo ou orçamento não enviado',
  })
  @ApiUnauthorizedResponse({ description: 'Assinatura ausente ou inválida' })
  @ApiNotFoundResponse({ description: 'Orçamento não encontrado' })
  @ApiConflictResponse({
    description: 'O orçamento já tem a decisão contrária',
  })
  @ApiServiceUnavailableResponse({
    description: 'BUDGET_WEBHOOK_SECRET não configurado',
  })
  async receiveDecision(
    @Body() dto: BudgetDecisionWebhookDto,
  ): Promise<BudgetResponseDto> {
    return BudgetMapper.toResponse(
      await this.budgetService.applyExternalDecision(dto),
    );
  }
}

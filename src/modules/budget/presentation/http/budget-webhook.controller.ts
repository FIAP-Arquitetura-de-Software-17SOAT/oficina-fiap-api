import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  ApplicationError,
  ApplicationErrorKind,
} from '../../../../shared/application/application.error';
import { Public } from '../../../../shared/http/auth/public.decorator';
import { statusFor } from '../../../../shared/http/filters/application-exception.filter';
import { ApplyExternalDecisionUseCase } from '../../application/use-cases/apply-external-decision.use-case';
import { FindBudgetByApprovalTokenUseCase } from '../../application/use-cases/find-budget-by-approval-token.use-case';
import { BudgetResponseDto } from './dto/budget.dto';
import { BudgetDecisionWebhookDto } from './dto/budget-webhook.dto';
import { BudgetResponseMapper } from './mappers/budget-response.mapper';
import {
  approvalPage,
  decisionResultPage,
  messagePage,
} from './views/approval-page.view';

/**
 * Resposta do cliente ao orçamento pelo link do email. Público, sem token de
 * acesso: quem autoriza é o token do link, que só o destinatário do email tem.
 * O id do orçamento sozinho não serve para nada aqui.
 *
 * Controller à parte porque o BudgetController exige ADMIN/EMPLOYEE na classe.
 */
@ApiTags('budgets')
@Public()
@Controller('budgets/webhooks')
export class BudgetWebhookController {
  constructor(
    private readonly findByApprovalToken: FindBudgetByApprovalTokenUseCase,
    private readonly applyExternalDecision: ApplyExternalDecisionUseCase,
  ) {}

  @Get('decision')
  @ApiOperation({
    summary: 'Página de confirmação que o link do email do orçamento abre',
    description:
      'Só mostra o orçamento com os botões Aprovar e Recusar; não decide ' +
      'nada. Scanners de email abrem links sozinhos, então um GET que ' +
      'aprovasse aprovaria sem o cliente.',
  })
  @ApiQuery({ name: 'token', required: true })
  @ApiProduces('text/html')
  @ApiOkResponse({ description: 'Página de confirmação' })
  @ApiNotFoundResponse({ description: 'Link inválido' })
  @ApiGoneResponse({ description: 'Link vencido' })
  async confirmationPage(
    @Query('token') token: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    this.prepareHtml(response);

    try {
      const budget = await this.findByApprovalToken.execute(token ?? '');
      return approvalPage(budget, token ?? '');
    } catch (error) {
      return this.errorPage(error, response);
    }
  }

  @Post('decision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Webhook: recebe a aprovação ou recusa do orçamento',
    description:
      'Exige o token do link do email, prova de que a resposta veio do ' +
      'cliente. Aceita JSON ou o formulário da página de confirmação ' +
      '(responde HTML quando o cliente pede text/html). A mesma decisão ' +
      'reentregue responde 200 sem repetir efeitos.',
  })
  @ApiOkResponse({ type: BudgetResponseDto })
  @ApiBadRequestResponse({ description: 'Corpo inválido ou recusa sem motivo' })
  @ApiNotFoundResponse({ description: 'Link inválido' })
  @ApiGoneResponse({ description: 'Link vencido' })
  @ApiConflictResponse({
    description: 'O orçamento já tem a decisão contrária',
  })
  async receiveDecision(
    @Body() dto: BudgetDecisionWebhookDto,
    @Headers('accept') accept: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BudgetResponseDto | string> {
    if (!accept?.includes('text/html')) {
      return BudgetResponseMapper.toResponse(
        await this.applyExternalDecision.execute(dto),
      );
    }

    this.prepareHtml(response);

    try {
      return decisionResultPage(await this.applyExternalDecision.execute(dto));
    } catch (error) {
      return this.errorPage(error, response);
    }
  }

  /**
   * O token está na URL: sem Referer ele não vaza para links externos, sem
   * cache não fica em proxy, e sem iframe ninguém embute o botão "Aprovar" numa
   * página maliciosa.
   */
  private prepareHtml(response: Response): void {
    response.type('html');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Frame-Options', 'DENY');
  }

  /**
   * Só erros de aplicação viram página: o `kind` diz o status e o título.
   * Qualquer outro erro (domínio, validação) sobe para os filtros globais.
   */
  private errorPage(error: unknown, response: Response): string {
    if (!(error instanceof ApplicationError)) throw error;

    response.status(statusFor(error.kind));
    const titles: Partial<Record<ApplicationErrorKind, string>> = {
      NOT_FOUND: 'Link inválido',
      GONE: 'Link vencido',
      CONFLICT: 'Orçamento já respondido',
    };

    return messagePage(
      titles[error.kind] ?? 'Não foi possível concluir',
      error.message,
    );
  }
}

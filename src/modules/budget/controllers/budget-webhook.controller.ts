import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Query,
  Res,
  forwardRef,
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
import { Public } from '../../../shared/http/auth/public.decorator';
import { BudgetResponseDto } from '../dto/budget.dto';
import { BudgetDecisionWebhookDto } from '../dto/budget-webhook.dto';
import { BudgetMapper } from '../mappers/budget.mapper';
import { BudgetService } from '../services/budget.service';
import {
  approvalPage,
  decisionResultPage,
  messagePage,
} from '../views/approval-page.view';

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
    @Inject(forwardRef(() => BudgetService))
    private readonly budgetService: BudgetService,
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
      const budget = await this.budgetService.findByApprovalToken(token ?? '');
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
      return BudgetMapper.toResponse(
        await this.budgetService.applyExternalDecision(dto),
      );
    }

    this.prepareHtml(response);

    try {
      return decisionResultPage(
        await this.budgetService.applyExternalDecision(dto),
      );
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

  private errorPage(error: unknown, response: Response): string {
    if (!(error instanceof HttpException)) throw error;

    response.status(error.getStatus());
    const titles: Partial<Record<number, string>> = {
      [HttpStatus.NOT_FOUND]: 'Link inválido',
      [HttpStatus.GONE]: 'Link vencido',
      [HttpStatus.CONFLICT]: 'Orçamento já respondido',
    };

    return messagePage(
      titles[error.getStatus()] ?? 'Não foi possível concluir',
      error.message,
    );
  }
}

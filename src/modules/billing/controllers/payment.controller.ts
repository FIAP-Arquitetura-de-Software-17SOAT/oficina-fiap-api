import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { PaymentReturnResponseDto } from '../dto/billing.dto';
import { BillingMapper } from '../mappers/billing.mapper';
import { BillingService } from '../services/billing.service';
import { Public } from '../../../shared/http/auth/public.decorator';

/**
 * Rotas de retorno do checkout do Stripe (`PAYMENT_SUCCESS_URL` e
 * `PAYMENT_CANCEL_URL`). Quem chega aqui é o navegador do cliente depois do
 * redirect, sem token — daí `@Public()`.
 *
 * Nenhuma das duas confia no que a URL diz: o estado do pagamento é sempre
 * relido no gateway antes de mexer em cobrança ou em OS.
 */
@ApiTags('payment')
@Controller('payment')
export class PaymentController {
  constructor(private readonly billingService: BillingService) {}

  @Get('success')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Retorno de sucesso do checkout: confirma o pagamento e entrega a OS',
  })
  @ApiQuery({
    name: 'session_id',
    required: true,
    description: 'Id da Checkout Session, preenchido pelo Stripe no redirect',
    example: 'cs_test_123',
  })
  @ApiOkResponse({ type: PaymentReturnResponseDto })
  @ApiBadRequestResponse({ description: 'session_id ausente' })
  @ApiNotFoundResponse({ description: 'Cobrança não encontrada' })
  async success(
    @Query('session_id') sessionId?: string,
  ): Promise<PaymentReturnResponseDto> {
    if (!sessionId?.trim()) {
      throw new BadRequestException('O id da sessão de checkout é obrigatório');
    }

    return BillingMapper.toPaymentReturnResponse(
      await this.billingService.confirmPaymentReturn(sessionId),
    );
  }

  @Get('cancel')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Retorno de cancelamento do checkout: deixa a OS com cobrança em aberto',
  })
  @ApiQuery({
    name: 'billing_id',
    required: true,
    format: 'uuid',
    description: 'Id da cobrança, embutido na cancel_url na criação da sessão',
  })
  @ApiOkResponse({ type: PaymentReturnResponseDto })
  @ApiBadRequestResponse({ description: 'billing_id ausente ou inválido' })
  @ApiNotFoundResponse({ description: 'Cobrança não encontrada' })
  async cancel(
    @Query('billing_id', ParseUUIDPipe) billingId: string,
  ): Promise<PaymentReturnResponseDto> {
    return BillingMapper.toPaymentReturnResponse(
      await this.billingService.registerPaymentCancellation(billingId),
    );
  }
}

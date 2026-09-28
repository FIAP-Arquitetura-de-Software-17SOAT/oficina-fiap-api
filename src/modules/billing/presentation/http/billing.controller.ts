import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  BillingResponseDto,
  FindBillingQueryDto,
  GenerateBillingDto,
} from './dto/billing.dto';
import { BillingResponseMapper } from './mappers/billing-response.mapper';
import { DeliverBilledServiceOrderUseCase } from '../../application/use-cases/deliver-billed-service-order.use-case';
import { ExpireBillingUseCase } from '../../application/use-cases/expire-billing.use-case';
import { FindBillingByServiceOrderUseCase } from '../../application/use-cases/find-billing-by-service-order.use-case';
import { FindBillingUseCase } from '../../application/use-cases/find-billing.use-case';
import { GenerateBillingUseCase } from '../../application/use-cases/generate-billing.use-case';
import { HandlePaymentWebhookUseCase } from '../../application/use-cases/handle-payment-webhook.use-case';
import { ListBillingsUseCase } from '../../application/use-cases/list-billings.use-case';
import { RenewPaymentLinkUseCase } from '../../application/use-cases/renew-payment-link.use-case';
import { Public } from '../../../../shared/http/auth/public.decorator';

@ApiTags('billings')
@Controller('billings')
export class BillingController {
  constructor(
    private readonly generateBilling: GenerateBillingUseCase,
    private readonly findBilling: FindBillingUseCase,
    private readonly findBillingByServiceOrder: FindBillingByServiceOrderUseCase,
    private readonly listBillings: ListBillingsUseCase,
    private readonly handlePaymentWebhook: HandlePaymentWebhookUseCase,
    private readonly expireBilling: ExpireBillingUseCase,
    private readonly renewLink: RenewPaymentLinkUseCase,
    private readonly deliverBilledServiceOrder: DeliverBilledServiceOrderUseCase,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Gera uma cobrança para uma ordem de serviço finalizada',
  })
  @ApiCreatedResponse({ type: BillingResponseDto })
  @ApiConflictResponse({ description: 'Service order cannot be billed' })
  @ApiNotFoundResponse({ description: 'Service order not found' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async generate(@Body() dto: GenerateBillingDto): Promise<BillingResponseDto> {
    return BillingResponseMapper.toResponse(
      await this.generateBilling.execute(dto),
    );
  }

  @Get()
  @ApiOperation({ summary: 'Lista cobranças ou busca por ordem de serviço' })
  @ApiOkResponse({ type: BillingResponseDto, isArray: true })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async findAll(
    @Query() query: FindBillingQueryDto,
  ): Promise<BillingResponseDto[]> {
    if (query.serviceOrderId) {
      return [
        BillingResponseMapper.toResponse(
          await this.findBillingByServiceOrder.execute(query.serviceOrderId),
        ),
      ];
    }

    return BillingResponseMapper.toResponseList(
      await this.listBillings.execute(),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca uma cobrança por id' })
  @ApiOkResponse({ type: BillingResponseDto })
  @ApiNotFoundResponse({ description: 'Cobrança não encontrada' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BillingResponseDto> {
    return BillingResponseMapper.toResponse(await this.findBilling.execute(id));
  }

  @Post('stripe/webhook')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Processa o webhook de pagamento do Stripe' })
  @ApiNoContentResponse({ description: 'Stripe webhook processed' })
  async handleStripeWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ): Promise<void> {
    if (!request.rawBody) {
      throw new BadRequestException(
        'O corpo bruto do webhook do Stripe é obrigatório',
      );
    }
    if (!signature?.trim()) {
      throw new BadRequestException(
        'O header de assinatura do Stripe é obrigatório',
      );
    }
    await this.handlePaymentWebhook.execute(request.rawBody, signature);
  }

  @Post(':id/expire')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Expira uma cobrança aguardando pagamento' })
  @ApiOkResponse({ type: BillingResponseDto })
  @ApiNotFoundResponse({ description: 'Cobrança não encontrada' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async expire(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BillingResponseDto> {
    return BillingResponseMapper.toResponse(
      await this.expireBilling.execute(id),
    );
  }

  @Post(':id/renew-payment-link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renova link de pagamento vencido com multa' })
  @ApiOkResponse({ type: BillingResponseDto })
  @ApiBadRequestResponse({
    description: 'O link de pagamento da cobrança ainda não expirou',
  })
  @ApiConflictResponse({ description: 'Cobrança paga é terminal' })
  @ApiNotFoundResponse({ description: 'Cobrança não encontrada' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async renewPaymentLink(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BillingResponseDto> {
    return BillingResponseMapper.toResponse(await this.renewLink.execute(id));
  }

  @Post(':id/deliver-service-order')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Entrega a ordem de serviço após a quitação' })
  @ApiNoContentResponse({ description: 'Service order delivered' })
  @ApiConflictResponse({
    description: 'A cobrança precisa estar paga para entregar a OS',
  })
  @ApiNotFoundResponse({ description: 'Cobrança não encontrada' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async deliverServiceOrder(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.deliverBilledServiceOrder.execute(id);
  }
}

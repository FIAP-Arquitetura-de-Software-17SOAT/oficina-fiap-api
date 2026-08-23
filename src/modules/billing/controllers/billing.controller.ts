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
} from '../dto/billing.dto';
import { BillingMapper } from '../mappers/billing.mapper';
import { BillingService } from '../services/billing.service';
import { Public } from '../../../shared/http/auth/public.decorator';

@ApiTags('billings')
@Controller('billings')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post()
  @ApiOperation({
    summary: 'Gera uma cobranca para uma ordem de servico concluida',
  })
  @ApiCreatedResponse({ type: BillingResponseDto })
  @ApiConflictResponse({ description: 'Service order cannot be billed' })
  @ApiNotFoundResponse({ description: 'Service order not found' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async generate(@Body() dto: GenerateBillingDto): Promise<BillingResponseDto> {
    return BillingMapper.toResponse(
      await this.billingService.generateForServiceOrder(dto),
    );
  }

  @Get()
  @ApiOperation({ summary: 'Lista cobrancas ou busca por ordem de servico' })
  @ApiOkResponse({ type: BillingResponseDto, isArray: true })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async findAll(
    @Query() query: FindBillingQueryDto,
  ): Promise<BillingResponseDto[]> {
    if (query.serviceOrderId) {
      return [
        BillingMapper.toResponse(
          await this.billingService.findByServiceOrderId(query.serviceOrderId),
        ),
      ];
    }

    return BillingMapper.toResponseList(await this.billingService.findAll());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca uma cobranca por id' })
  @ApiOkResponse({ type: BillingResponseDto })
  @ApiNotFoundResponse({ description: 'Billing not found' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BillingResponseDto> {
    return BillingMapper.toResponse(await this.billingService.findById(id));
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
      throw new BadRequestException('Raw Stripe webhook body is required');
    }
    if (!signature?.trim()) {
      throw new BadRequestException('Stripe signature header is required');
    }
    await this.billingService.handlePaymentWebhook(request.rawBody, signature);
  }

  @Post(':id/expire')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Expira uma cobranca aguardando pagamento' })
  @ApiOkResponse({ type: BillingResponseDto })
  @ApiNotFoundResponse({ description: 'Billing not found' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async expire(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BillingResponseDto> {
    return BillingMapper.toResponse(await this.billingService.expire(id));
  }

  @Post(':id/renew-payment-link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renova link de pagamento vencido com multa' })
  @ApiOkResponse({ type: BillingResponseDto })
  @ApiBadRequestResponse({
    description: 'Billing payment link has not expired yet',
  })
  @ApiConflictResponse({ description: 'Paid billing is terminal' })
  @ApiNotFoundResponse({ description: 'Billing not found' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async renewPaymentLink(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BillingResponseDto> {
    return BillingMapper.toResponse(
      await this.billingService.renewPaymentLink(id),
    );
  }

  @Post(':id/deliver-service-order')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Entrega a ordem de servico apos quitacao' })
  @ApiNoContentResponse({ description: 'Service order delivered' })
  @ApiConflictResponse({ description: 'Billing must be paid before delivery' })
  @ApiNotFoundResponse({ description: 'Billing not found' })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  async deliverServiceOrder(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.billingService.deliverServiceOrder(id);
  }
}

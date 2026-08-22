import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  BillingResponseDto,
  FindBillingQueryDto,
  GenerateBillingDto,
  RegisterPaymentDto,
} from '../dto/billing.dto';
import { BillingMapper } from '../mappers/billing.mapper';
import { BillingService } from '../services/billing.service';

@ApiTags('billings')
@Controller('billings')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post()
  @ApiOperation({ summary: 'Gera uma cobranca para uma ordem de servico concluida' })
  @ApiCreatedResponse({ type: BillingResponseDto })
  @ApiConflictResponse({ description: 'Service order cannot be billed' })
  @ApiNotFoundResponse({ description: 'Service order not found' })
  async generate(@Body() dto: GenerateBillingDto): Promise<BillingResponseDto> {
    return BillingMapper.toResponse(
      await this.billingService.generateForServiceOrder(dto),
    );
  }

  @Get()
  @ApiOperation({ summary: 'Lista cobrancas ou busca por ordem de servico' })
  @ApiOkResponse({ type: BillingResponseDto, isArray: true })
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
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BillingResponseDto> {
    return BillingMapper.toResponse(await this.billingService.findById(id));
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Registra pagamento na cobranca' })
  @ApiCreatedResponse({ type: BillingResponseDto })
  @ApiBadRequestResponse({ description: 'Payment amount is invalid' })
  @ApiNotFoundResponse({ description: 'Billing not found' })
  async registerPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegisterPaymentDto,
  ): Promise<BillingResponseDto> {
    return BillingMapper.toResponse(
      await this.billingService.registerPayment(id, dto),
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancela uma cobranca aberta ou parcialmente paga' })
  @ApiOkResponse({ type: BillingResponseDto })
  @ApiBadRequestResponse({ description: 'Billing status is invalid' })
  @ApiNotFoundResponse({ description: 'Billing not found' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BillingResponseDto> {
    return BillingMapper.toResponse(await this.billingService.cancel(id));
  }

  @Post(':id/deliver-service-order')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Entrega a ordem de servico apos quitacao' })
  @ApiNoContentResponse({ description: 'Service order delivered' })
  @ApiConflictResponse({ description: 'Billing must be paid before delivery' })
  @ApiNotFoundResponse({ description: 'Billing not found' })
  async deliverServiceOrder(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.billingService.deliverServiceOrder(id);
  }
}

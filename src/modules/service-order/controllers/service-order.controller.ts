import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AverageExecutionTimeResponseDto,
  CancelServiceOrderDto,
  OpenServiceOrderDto,
  ServiceOrderResponseDto,
} from '../dto/service-order.dto';
import { ServiceOrderMapper } from '../mappers/service-order.mapper';
import { ServiceOrderService } from '../services/service-order.service';

@ApiTags('service-order')
@Controller('service-order')
export class ServiceOrderController {
  constructor(private readonly serviceOrderService: ServiceOrderService) {}

  @Post()
  @ApiOperation({ summary: 'Abre uma ordem de serviço' })
  @ApiCreatedResponse({ type: ServiceOrderResponseDto })
  @ApiBadRequestResponse({ description: 'Campos obrigatórios ausentes' })
  @ApiNotFoundResponse({ description: 'Client not found' })
  async openServiceOrder(
    @Body() dto: OpenServiceOrderDto,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.openServiceOrder(dto),
    );
  }

  @Get()
  @ApiOperation({ summary: 'Lista as ordens de serviço' })
  @ApiOkResponse({ type: ServiceOrderResponseDto, isArray: true })
  async findAll(): Promise<ServiceOrderResponseDto[]> {
    return ServiceOrderMapper.toResponseList(
      await this.serviceOrderService.findAll(),
    );
  }

  @Get('metrics/average-execution-time')
  @ApiOperation({
    summary: 'Tempo médio de execução das ordens de serviço finalizadas',
  })
  @ApiOkResponse({ type: AverageExecutionTimeResponseDto })
  async getAverageExecutionTime(): Promise<AverageExecutionTimeResponseDto> {
    return this.serviceOrderService.getAverageExecutionTime();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca uma ordem de serviço por id' })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiNotFoundResponse({ description: 'Service order not found' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.findById(id),
    );
  }

  @Patch(':id/start-diagnosis')
  @ApiOperation({ summary: 'Inicia o diagnóstico da OS' })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiBadRequestResponse({ description: 'Transição de status inválida' })
  @ApiNotFoundResponse({ description: 'Service order not found' })
  async startDiagnosis(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.startDiagnosis(id),
    );
  }

  @Patch(':id/await-approval')
  @ApiOperation({ summary: 'Coloca a OS aguardando aprovação do orçamento' })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiBadRequestResponse({ description: 'Transição de status inválida' })
  @ApiNotFoundResponse({ description: 'Service order not found' })
  async awaitApproval(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.awaitApproval(id),
    );
  }

  @Patch(':id/await-parts')
  @ApiOperation({ summary: 'Coloca a OS aguardando peças' })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiBadRequestResponse({ description: 'Transição de status inválida' })
  @ApiNotFoundResponse({ description: 'Service order not found' })
  async awaitParts(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.awaitParts(id),
    );
  }

  @Patch(':id/start-progress')
  @ApiOperation({ summary: 'Inicia a execução do serviço' })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiBadRequestResponse({ description: 'Transição de status inválida' })
  @ApiNotFoundResponse({ description: 'Service order not found' })
  async startProgress(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.startProgress(id),
    );
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Finaliza a OS' })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiBadRequestResponse({ description: 'Transição de status inválida' })
  @ApiNotFoundResponse({ description: 'Service order not found' })
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.complete(id),
    );
  }

  @Patch(':id/deliver')
  @ApiOperation({ summary: 'Marca a OS como entregue ao cliente' })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiBadRequestResponse({ description: 'Transição de status inválida' })
  @ApiNotFoundResponse({ description: 'Service order not found' })
  async deliver(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.deliver(id),
    );
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancela a OS' })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiBadRequestResponse({
    description: 'Transição de status inválida ou motivo ausente',
  })
  @ApiNotFoundResponse({ description: 'Service order not found' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelServiceOrderDto,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.cancel(id, dto),
    );
  }
}

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
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AssignMechanicDto,
  AverageExecutionTimeResponseDto,
  CancelServiceOrderDto,
  OpenServiceOrderDto,
  ServiceOrderResponseDto,
} from '../dto/service-order.dto';
import { ServiceOrderMapper } from '../mappers/service-order.mapper';
import { ServiceOrderService } from '../services/service-order.service';
import { Role } from '../../../../generated/prisma/enums';
import { Roles } from '../../../shared/http/auth/roles.decorator';

@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Roles(Role.ADMIN, Role.EMPLOYEE)
@ApiTags('service-order')
@Controller('service-order')
export class ServiceOrderController {
  constructor(private readonly serviceOrderService: ServiceOrderService) {}

  @Post()
  @ApiOperation({ summary: 'Open a service order' })
  @ApiCreatedResponse({ type: ServiceOrderResponseDto })
  @ApiBadRequestResponse({ description: 'Required fields are missing' })
  @ApiNotFoundResponse({ description: 'Client not found' })
  async openServiceOrder(
    @Body() dto: OpenServiceOrderDto,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.openServiceOrder(dto),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List service orders' })
  @ApiOkResponse({ type: ServiceOrderResponseDto, isArray: true })
  async findAll(): Promise<ServiceOrderResponseDto[]> {
    return ServiceOrderMapper.toResponseList(
      await this.serviceOrderService.findAll(),
    );
  }

  @Get('metrics/average-execution-time')
  @ApiOperation({
    summary: 'Average execution time for completed service orders',
  })
  @ApiOkResponse({ type: AverageExecutionTimeResponseDto })
  async getAverageExecutionTime(): Promise<AverageExecutionTimeResponseDto> {
    return this.serviceOrderService.getAverageExecutionTime();
  }

  @Get('client/:clientId')
  @ApiOperation({
    summary: 'Track a customer service orders',
    description:
      'Returns the customer service orders from newest to oldest with their ' +
      'current status. Returns an empty list when the customer has none.',
  })
  @ApiOkResponse({ type: ServiceOrderResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: 'Client not found' })
  async findByClientId(
    @Param('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<ServiceOrderResponseDto[]> {
    return ServiceOrderMapper.toResponseList(
      await this.serviceOrderService.findByClientId(clientId),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Find a service order by id' })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiNotFoundResponse({ description: 'Service order not found' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.findById(id),
    );
  }

  @Patch(':id/assign')
  @ApiOperation({
    summary: 'Assign a mechanic to a service order',
    description:
      'Moves the service order to IN_DIAGNOSIS and starts the execution timer. ' +
      'A mechanic cannot take another service order before completing the current one.',
  })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid status transition or service order already assigned',
  })
  @ApiConflictResponse({
    description: 'Mechanic already has an open service order',
  })
  @ApiNotFoundResponse({ description: 'Service order not found' })
  async assignToMechanic(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignMechanicDto,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.assignToMechanic(id, dto),
    );
  }

  /**
   * Sem rota HTTP de propósito. Quem move a OS para AWAITING_APPROVAL é a
   * política de geração do orçamento, que chama este método.
   */
  async awaitApproval(id: string): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.awaitApproval(id),
    );
  }

  /**
   * Sem rota HTTP de propósito. Quem move a OS para AWAITING_PARTS é a política
   * de aceite do orçamento, que chama este método. Expor como endpoint criaria
   * um caminho paralelo ao fluxo.
   */
  async awaitParts(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.awaitParts(id),
    );
  }

  /**
   * Sem rota HTTP de propósito. A OS só entra em execução pelas mãos do
   * estoque, depois de as peças serem atendidas — ver PartsDispatchService.
   */
  async registerPartsDispatched(id: string): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.registerPartsDispatched(id),
    );
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Complete a service order' })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid status transition' })
  @ApiNotFoundResponse({ description: 'Service order not found' })
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderMapper.toResponse(
      await this.serviceOrderService.complete(id),
    );
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel a service order' })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid status transition or missing cancellation reason',
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

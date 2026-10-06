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
} from './dto/service-order.dto';
import { ServiceOrderResponseMapper } from './mappers/service-order-response.mapper';
import { AssignMechanicUseCase } from '../../application/use-cases/assign-mechanic.use-case';
import { CancelServiceOrderUseCase } from '../../application/use-cases/cancel-service-order.use-case';
import { CompleteServiceOrderUseCase } from '../../application/use-cases/complete-service-order.use-case';
import { FindServiceOrderUseCase } from '../../application/use-cases/find-service-order.use-case';
import { GetAverageExecutionTimeUseCase } from '../../application/use-cases/get-average-execution-time.use-case';
import { ListServiceOrdersByClientUseCase } from '../../application/use-cases/list-service-orders-by-client.use-case';
import { ListServiceOrdersUseCase } from '../../application/use-cases/list-service-orders.use-case';
import { OpenServiceOrderUseCase } from '../../application/use-cases/open-service-order.use-case';
import { Role } from '../../../../../generated/prisma/enums';
import { Roles } from '../../../../shared/http/auth/roles.decorator';
import {
  clientScopeOf,
  CurrentUser,
} from '../../../../shared/http/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../../../shared/http/auth/current-user.decorator';

/**
 * Só as transições que são ação de alguém na oficina têm rota. As demais
 * (aguardar aprovação, aguardar peças, peças atendidas, aguardar pagamento,
 * entregar) são políticas disparadas por outros módulos, que injetam os
 * casos de uso exportados pelo ServiceOrderModule.
 */
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Roles(Role.ADMIN, Role.EMPLOYEE)
@ApiTags('service-orders')
@Controller('service-orders')
export class ServiceOrderController {
  constructor(
    private readonly openServiceOrderUseCase: OpenServiceOrderUseCase,
    private readonly listServiceOrders: ListServiceOrdersUseCase,
    private readonly getAverageExecutionTimeUseCase: GetAverageExecutionTimeUseCase,
    private readonly listByClient: ListServiceOrdersByClientUseCase,
    private readonly findServiceOrder: FindServiceOrderUseCase,
    private readonly assignMechanic: AssignMechanicUseCase,
    private readonly completeServiceOrder: CompleteServiceOrderUseCase,
    private readonly cancelServiceOrder: CancelServiceOrderUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Open a service order' })
  @ApiCreatedResponse({ type: ServiceOrderResponseDto })
  @ApiBadRequestResponse({ description: 'Required fields are missing' })
  @ApiNotFoundResponse({ description: 'Client not found' })
  async openServiceOrder(
    @Body() dto: OpenServiceOrderDto,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderResponseMapper.toResponse(
      await this.openServiceOrderUseCase.execute(dto),
    );
  }

  @Get()
  @ApiOperation({
    summary: 'List service orders',
    description:
      'Hides COMPLETED and DELIVERED orders (they are still stored and ' +
      'reachable by id). Sorted by status: IN_PROGRESS, AWAITING_PARTS, ' +
      'AWAITING_PAYMENT, AWAITING_APPROVAL, IN_DIAGNOSIS, RECEIVED, ' +
      'CANCELLED; oldest first within each status.',
  })
  @ApiOkResponse({ type: ServiceOrderResponseDto, isArray: true })
  async findAll(): Promise<ServiceOrderResponseDto[]> {
    return ServiceOrderResponseMapper.toResponseList(
      await this.listServiceOrders.execute(),
    );
  }

  @Get('metrics/average-execution-time')
  @ApiOperation({
    summary: 'Average execution time for completed service orders',
  })
  @ApiOkResponse({ type: AverageExecutionTimeResponseDto })
  async getAverageExecutionTime(): Promise<AverageExecutionTimeResponseDto> {
    return this.getAverageExecutionTimeUseCase.execute();
  }

  @Get('clients/:clientId')
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
    return ServiceOrderResponseMapper.toResponseList(
      await this.listByClient.execute(clientId),
    );
  }

  @Get('mine')
  @Roles(Role.CUSTOMER)
  @ApiOperation({
    summary: 'Service orders of the logged-in customer',
    description:
      'CUSTOMER only. Returns the customer service orders from newest to ' +
      'oldest with their current status.',
  })
  @ApiOkResponse({ type: ServiceOrderResponseDto, isArray: true })
  async findMine(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ServiceOrderResponseDto[]> {
    return ServiceOrderResponseMapper.toResponseList(
      await this.listByClient.execute(user.clientId as string),
    );
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.EMPLOYEE, Role.CUSTOMER)
  @ApiOperation({
    summary: 'Find a service order by id',
    description:
      'A CUSTOMER only sees their own service orders; any other id answers 404.',
  })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiNotFoundResponse({ description: 'Service order not found' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<ServiceOrderResponseDto> {
    return ServiceOrderResponseMapper.toResponse(
      await this.findServiceOrder.execute(id, clientScopeOf(user)),
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
    return ServiceOrderResponseMapper.toResponse(
      await this.assignMechanic.execute(id, dto),
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
    return ServiceOrderResponseMapper.toResponse(
      await this.completeServiceOrder.execute(id),
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
    return ServiceOrderResponseMapper.toResponse(
      await this.cancelServiceOrder.execute(id, dto),
    );
  }
}

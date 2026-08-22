import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  forwardRef,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '../../../../generated/prisma/enums';
import { JwtAuthGuard } from '../../../shared/http/auth/jwt-auth.guard';
import { Roles } from '../../../shared/http/auth/roles.decorator';
import { RolesGuard } from '../../../shared/http/auth/roles.guard';
import { CreatePartDto, PartResponseDto, UpdatePartDto } from '../dto/part.dto';
import {
  CreateStockMovementDto,
  StockMovementResponseDto,
} from '../dto/stock-movement.dto';
import { PartsDispatchResponseDto } from '../dto/parts-dispatch.dto';
import { PartMapper } from '../mappers/part.mapper';
import { PartService } from '../services/part.service';
import { PartsDispatchService } from '../services/parts-dispatch.service';
import { StockMovementService } from '../services/stock-movement.service';

@ApiTags('stock')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'Authenticated role is not allowed' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.EMPLOYEE)
@Controller('stock')
export class PartController {
  constructor(
    private readonly partService: PartService,
    private readonly stockMovementService: StockMovementService,
    // forwardRef fecha o ciclo estoque -> pedido de compra -> estoque: o
    // dispatch abre o pedido quando falta peça, e o pedido devolve a peça aqui.
    @Inject(forwardRef(() => PartsDispatchService))
    private readonly partsDispatchService: PartsDispatchService,
  ) {}

  @Post('service-orders/:serviceOrderId/dispatch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Consulta e baixa as peças do orçamento aceito de uma OS',
    description:
      'Havendo saldo, baixa as peças e move a OS para EM_EXECUCAO. Faltando ' +
      'peça, nada é baixado e um pedido de compra é aberto com a diferença.',
  })
  @ApiOkResponse({ type: PartsDispatchResponseDto })
  @ApiBadRequestResponse({
    description: 'OS sem orçamento aceito ou com item de peça sem referência',
  })
  @ApiNotFoundResponse({ description: 'Part not found' })
  @ApiConflictResponse({ description: 'Insufficient stock' })
  async dispatchServiceOrderParts(
    @Param('serviceOrderId', ParseUUIDPipe) serviceOrderId: string,
  ): Promise<PartsDispatchResponseDto> {
    return this.partsDispatchService.dispatchForServiceOrder(serviceOrderId);
  }

  @Post()
  @ApiOperation({ summary: 'Creates a stock part' })
  @ApiCreatedResponse({ type: PartResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid part data' })
  @ApiConflictResponse({ description: 'Part code already in use' })
  async create(@Body() dto: CreatePartDto): Promise<PartResponseDto> {
    return PartMapper.toResponse(await this.partService.create(dto));
  }

  @Get()
  @ApiOperation({ summary: 'Lists stock parts' })
  @ApiOkResponse({ type: PartResponseDto, isArray: true })
  async findAll(): Promise<PartResponseDto[]> {
    return PartMapper.toResponseList(await this.partService.findAll());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Gets a stock part by id' })
  @ApiOkResponse({ type: PartResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid part id' })
  @ApiNotFoundResponse({ description: 'Part not found' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PartResponseDto> {
    return PartMapper.toResponse(await this.partService.findById(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Updates a stock part' })
  @ApiOkResponse({ type: PartResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid part id or data' })
  @ApiNotFoundResponse({ description: 'Part not found' })
  @ApiConflictResponse({ description: 'Part code already in use' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePartDto,
  ): Promise<PartResponseDto> {
    return PartMapper.toResponse(await this.partService.update(id, dto));
  }

  @Post(':id/stock/in')
  @ApiOperation({ summary: 'Records an inbound stock movement' })
  @ApiOkResponse({ type: StockMovementResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid part id or movement data' })
  @ApiNotFoundResponse({ description: 'Part not found' })
  async increaseStock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateStockMovementDto,
  ): Promise<{
    part: PartResponseDto;
    movement: StockMovementResponseDto;
    replayed: boolean;
  }> {
    const result = await this.stockMovementService.increase(id, dto);
    return { ...result, part: PartMapper.toResponse(result.part) };
  }

  @Post(':id/stock/out')
  @ApiOperation({ summary: 'Records an outbound stock movement' })
  @ApiOkResponse({ type: StockMovementResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid part id or movement data' })
  @ApiNotFoundResponse({ description: 'Part not found' })
  @ApiConflictResponse({
    description: 'Insufficient stock or idempotency key conflict',
  })
  async decreaseStock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateStockMovementDto,
  ): Promise<{
    part: PartResponseDto;
    movement: StockMovementResponseDto;
    replayed: boolean;
  }> {
    const result = await this.stockMovementService.decrease(id, dto);
    return { ...result, part: PartMapper.toResponse(result.part) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deletes a stock part' })
  @ApiNoContentResponse({ description: 'Part deleted' })
  @ApiBadRequestResponse({ description: 'Invalid part id' })
  @ApiNotFoundResponse({ description: 'Part not found' })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.partService.delete(id);
  }
}

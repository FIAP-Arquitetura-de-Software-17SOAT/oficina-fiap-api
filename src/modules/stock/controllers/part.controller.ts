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

@ApiTags('parts')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token de acesso ausente ou inválido' })
@ApiForbiddenResponse({ description: 'Perfil autenticado não tem permissão' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.EMPLOYEE)
@Controller('parts')
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
      'Havendo saldo, baixa as peças e move a OS para Em execução (IN_PROGRESS). ' +
      'Faltando peça, nada é baixado e um pedido de compra é aberto com a diferença.',
  })
  @ApiOkResponse({ type: PartsDispatchResponseDto })
  @ApiBadRequestResponse({
    description: 'OS sem orçamento aceito ou com item de peça sem referência',
  })
  @ApiNotFoundResponse({ description: 'Peça não encontrada' })
  @ApiConflictResponse({ description: 'Estoque insuficiente' })
  async dispatchServiceOrderParts(
    @Param('serviceOrderId', ParseUUIDPipe) serviceOrderId: string,
  ): Promise<PartsDispatchResponseDto> {
    return this.partsDispatchService.dispatchForServiceOrder(serviceOrderId);
  }

  @Post()
  @ApiOperation({ summary: 'Cadastra uma peça ou insumo' })
  @ApiCreatedResponse({ type: PartResponseDto })
  @ApiBadRequestResponse({ description: 'Dados da peça inválidos' })
  @ApiConflictResponse({ description: 'Código da peça já cadastrado' })
  async create(@Body() dto: CreatePartDto): Promise<PartResponseDto> {
    return PartMapper.toResponse(await this.partService.create(dto));
  }

  @Get()
  @ApiOperation({ summary: 'Lista as peças e insumos' })
  @ApiOkResponse({ type: PartResponseDto, isArray: true })
  async findAll(): Promise<PartResponseDto[]> {
    return PartMapper.toResponseList(await this.partService.findAll());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta uma peça ou insumo por id' })
  @ApiOkResponse({ type: PartResponseDto })
  @ApiBadRequestResponse({ description: 'Id da peça inválido' })
  @ApiNotFoundResponse({ description: 'Peça não encontrada' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PartResponseDto> {
    return PartMapper.toResponse(await this.partService.findById(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza uma peça ou insumo' })
  @ApiOkResponse({ type: PartResponseDto })
  @ApiBadRequestResponse({ description: 'Id ou dados da peça inválidos' })
  @ApiNotFoundResponse({ description: 'Peça não encontrada' })
  @ApiConflictResponse({ description: 'Código da peça já cadastrado' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePartDto,
  ): Promise<PartResponseDto> {
    return PartMapper.toResponse(await this.partService.update(id, dto));
  }

  @Post(':id/movements/in')
  @ApiOperation({ summary: 'Registra entrada no estoque' })
  @ApiOkResponse({ type: StockMovementResponseDto })
  @ApiBadRequestResponse({
    description: 'Id da peça ou dados da movimentação inválidos',
  })
  @ApiNotFoundResponse({ description: 'Peça não encontrada' })
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

  @Post(':id/movements/out')
  @ApiOperation({ summary: 'Registra saída do estoque' })
  @ApiOkResponse({ type: StockMovementResponseDto })
  @ApiBadRequestResponse({
    description: 'Id da peça ou dados da movimentação inválidos',
  })
  @ApiNotFoundResponse({ description: 'Peça não encontrada' })
  @ApiConflictResponse({
    description: 'Estoque insuficiente ou conflito de chave de idempotência',
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
  @ApiOperation({ summary: 'Remove uma peça ou insumo' })
  @ApiNoContentResponse({ description: 'Peça removida' })
  @ApiBadRequestResponse({ description: 'Id da peça inválido' })
  @ApiNotFoundResponse({ description: 'Peça não encontrada' })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.partService.delete(id);
  }
}

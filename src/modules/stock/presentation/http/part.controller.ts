import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { Role } from '../../../../../generated/prisma/enums';
import { Roles } from '../../../../shared/http/auth/roles.decorator';
import { CreatePartDto, PartResponseDto, UpdatePartDto } from './dto/part.dto';
import {
  CreateStockMovementDto,
  StockMovementResponseDto,
} from './dto/stock-movement.dto';
import { PartResponseMapper } from './mappers/part-response.mapper';
import { CreatePartUseCase } from '../../application/use-cases/create-part.use-case';
import { FindPartUseCase } from '../../application/use-cases/find-part.use-case';
import { ListPartsUseCase } from '../../application/use-cases/list-parts.use-case';
import { UpdatePartUseCase } from '../../application/use-cases/update-part.use-case';
import { DeletePartUseCase } from '../../application/use-cases/delete-part.use-case';
import { IncreaseStockUseCase } from '../../application/use-cases/increase-stock.use-case';
import { DecreaseStockUseCase } from '../../application/use-cases/decrease-stock.use-case';

@ApiTags('parts')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token de acesso ausente ou inválido' })
@ApiForbiddenResponse({ description: 'Perfil autenticado não tem permissão' })
// JwtAuthGuard e RolesGuard já são globais (APP_GUARD); não precisam ser
// repetidos aqui.
@Roles(Role.ADMIN, Role.EMPLOYEE)
@Controller('parts')
export class PartController {
  constructor(
    private readonly createPart: CreatePartUseCase,
    private readonly findPart: FindPartUseCase,
    private readonly listParts: ListPartsUseCase,
    private readonly updatePart: UpdatePartUseCase,
    private readonly deletePart: DeletePartUseCase,
    private readonly increaseStockUseCase: IncreaseStockUseCase,
    private readonly decreaseStockUseCase: DecreaseStockUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Cadastra uma peça ou insumo' })
  @ApiCreatedResponse({ type: PartResponseDto })
  @ApiBadRequestResponse({ description: 'Dados da peça inválidos' })
  @ApiConflictResponse({ description: 'Código da peça já cadastrado' })
  async create(@Body() dto: CreatePartDto): Promise<PartResponseDto> {
    return PartResponseMapper.toResponse(await this.createPart.execute(dto));
  }

  @Get()
  @ApiOperation({ summary: 'Lista as peças e insumos' })
  @ApiOkResponse({ type: PartResponseDto, isArray: true })
  async findAll(): Promise<PartResponseDto[]> {
    return PartResponseMapper.toResponseList(await this.listParts.execute());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta uma peça ou insumo por id' })
  @ApiOkResponse({ type: PartResponseDto })
  @ApiBadRequestResponse({ description: 'Id da peça inválido' })
  @ApiNotFoundResponse({ description: 'Peça não encontrada' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PartResponseDto> {
    return PartResponseMapper.toResponse(await this.findPart.execute(id));
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
    return PartResponseMapper.toResponse(
      await this.updatePart.execute(id, dto),
    );
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
    const result = await this.increaseStockUseCase.execute(id, dto);
    return { ...result, part: PartResponseMapper.toResponse(result.part) };
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
    const result = await this.decreaseStockUseCase.execute(id, dto);
    return { ...result, part: PartResponseMapper.toResponse(result.part) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove uma peça ou insumo' })
  @ApiNoContentResponse({ description: 'Peça removida' })
  @ApiBadRequestResponse({ description: 'Id da peça inválido' })
  @ApiNotFoundResponse({ description: 'Peça não encontrada' })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.deletePart.execute(id);
  }
}

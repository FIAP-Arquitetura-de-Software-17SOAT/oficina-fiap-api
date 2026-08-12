import {
  Body,
  Controller,
  Delete,
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
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  BudgetResponseDto,
  BudgetTotalResponseDto,
  CreateBudgetDto,
  CreateBudgetItemDto,
  FindBudgetsQueryDto,
  RefuseBudgetDto,
} from '../dto/budget.dto';
import { BudgetMapper } from '../mappers/budget.mapper';
import { BudgetService } from '../services/budget.service';

@ApiTags('budget')
@Controller('budgets')
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  @Post()
  @ApiOperation({ summary: 'Cria um orcamento' })
  @ApiCreatedResponse({ type: BudgetResponseDto })
  @ApiBadRequestResponse({ description: 'Dados do orcamento invalidos' })
  async create(@Body() dto: CreateBudgetDto): Promise<BudgetResponseDto> {
    return BudgetMapper.toResponse(await this.budgetService.create(dto));
  }

  @Post(':id/items')
  @ApiOperation({ summary: 'Adiciona um item ao orcamento' })
  @ApiCreatedResponse({ type: BudgetResponseDto })
  @ApiBadRequestResponse({
    description: 'Item ou status do orcamento invalido',
  })
  @ApiNotFoundResponse({ description: 'Budget not found' })
  async addItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBudgetItemDto,
  ): Promise<BudgetResponseDto> {
    return BudgetMapper.toResponse(await this.budgetService.addItem(id, dto));
  }

  @Delete(':id/items/:itemId')
  @ApiOperation({ summary: 'Remove um item do orcamento' })
  @ApiOkResponse({ type: BudgetResponseDto })
  @ApiBadRequestResponse({
    description: 'Item ou status do orcamento invalido',
  })
  @ApiNotFoundResponse({ description: 'Budget not found' })
  async removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<BudgetResponseDto> {
    return BudgetMapper.toResponse(
      await this.budgetService.removeItem(id, itemId),
    );
  }

  @Get(':id/total')
  @ApiOperation({ summary: 'Calcula o total do orcamento' })
  @ApiOkResponse({ type: BudgetTotalResponseDto })
  @ApiNotFoundResponse({ description: 'Budget not found' })
  async calculateTotal(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BudgetTotalResponseDto> {
    return {
      budgetId: id,
      totalAmount: await this.budgetService.calculateTotal(id),
    };
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Envia o orcamento ao cliente' })
  @ApiOkResponse({ type: BudgetResponseDto })
  @ApiBadRequestResponse({ description: 'Budget status is invalid' })
  @ApiNotFoundResponse({ description: 'Budget not found' })
  async send(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BudgetResponseDto> {
    return BudgetMapper.toResponse(await this.budgetService.send(id));
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aceita o orcamento' })
  @ApiOkResponse({ type: BudgetResponseDto })
  @ApiBadRequestResponse({ description: 'Budget status is invalid' })
  @ApiNotFoundResponse({ description: 'Budget not found' })
  async accept(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BudgetResponseDto> {
    return BudgetMapper.toResponse(await this.budgetService.accept(id));
  }

  @Post(':id/refuse')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recusa o orcamento' })
  @ApiOkResponse({ type: BudgetResponseDto })
  @ApiBadRequestResponse({
    description: 'Motivo ou status do orcamento invalido',
  })
  @ApiNotFoundResponse({ description: 'Budget not found' })
  async refuse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefuseBudgetDto,
  ): Promise<BudgetResponseDto> {
    return BudgetMapper.toResponse(await this.budgetService.refuse(id, dto));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca um orcamento por id' })
  @ApiOkResponse({ type: BudgetResponseDto })
  @ApiNotFoundResponse({ description: 'Budget not found' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BudgetResponseDto> {
    return BudgetMapper.toResponse(await this.budgetService.findById(id));
  }

  @Get()
  @ApiOperation({ summary: 'Lista orcamentos por ordem de servico' })
  @ApiOkResponse({ type: BudgetResponseDto, isArray: true })
  async findByServiceOrderId(
    @Query() query: FindBudgetsQueryDto,
  ): Promise<BudgetResponseDto[]> {
    return BudgetMapper.toResponseList(
      await this.budgetService.findByServiceOrderId(query.serviceOrderId),
    );
  }
}

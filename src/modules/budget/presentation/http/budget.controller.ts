import {
  BadRequestException,
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
  BudgetResponseDto,
  BudgetTotalResponseDto,
  CreateBudgetDto,
  CreateBudgetItemDto,
  FindBudgetsQueryDto,
  RefuseBudgetDto,
} from './dto/budget.dto';
import { BudgetResponseMapper } from './mappers/budget-response.mapper';
import { AcceptBudgetUseCase } from '../../application/use-cases/accept-budget.use-case';
import { AddBudgetItemUseCase } from '../../application/use-cases/add-budget-item.use-case';
import { CalculateBudgetTotalUseCase } from '../../application/use-cases/calculate-budget-total.use-case';
import { CreateBudgetUseCase } from '../../application/use-cases/create-budget.use-case';
import { FindBudgetUseCase } from '../../application/use-cases/find-budget.use-case';
import { ListBudgetsByServiceOrderUseCase } from '../../application/use-cases/list-budgets-by-service-order.use-case';
import { ListBudgetsUseCase } from '../../application/use-cases/list-budgets.use-case';
import { RefuseBudgetUseCase } from '../../application/use-cases/refuse-budget.use-case';
import { RemoveBudgetItemUseCase } from '../../application/use-cases/remove-budget-item.use-case';
import { SendBudgetUseCase } from '../../application/use-cases/send-budget.use-case';
import { Role } from '../../../../../generated/prisma/enums';
import { Roles } from '../../../../shared/http/auth/roles.decorator';
import {
  clientScopeOf,
  CurrentUser,
} from '../../../../shared/http/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../../../shared/http/auth/current-user.decorator';

@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token de acesso ausente ou inválido' })
@Roles(Role.ADMIN, Role.EMPLOYEE)
@ApiTags('budgets')
@Controller('budgets')
export class BudgetController {
  constructor(
    private readonly createBudget: CreateBudgetUseCase,
    private readonly addBudgetItem: AddBudgetItemUseCase,
    private readonly removeBudgetItem: RemoveBudgetItemUseCase,
    private readonly calculateBudgetTotal: CalculateBudgetTotalUseCase,
    private readonly sendBudget: SendBudgetUseCase,
    private readonly acceptBudget: AcceptBudgetUseCase,
    private readonly refuseBudget: RefuseBudgetUseCase,
    private readonly findBudget: FindBudgetUseCase,
    private readonly listBudgets: ListBudgetsUseCase,
    private readonly listByServiceOrder: ListBudgetsByServiceOrderUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Gera um orçamento' })
  @ApiCreatedResponse({ type: BudgetResponseDto })
  @ApiBadRequestResponse({ description: 'Dados do orçamento inválidos' })
  @ApiNotFoundResponse({
    description: 'Peça ou serviço referenciado por um item não existe',
  })
  @ApiConflictResponse({ description: 'Versão do orçamento já existe' })
  async create(@Body() dto: CreateBudgetDto): Promise<BudgetResponseDto> {
    return BudgetResponseMapper.toResponse(
      await this.createBudget.execute(dto),
    );
  }

  @Post(':id/items')
  @ApiOperation({ summary: 'Adiciona um item ao orçamento' })
  @ApiCreatedResponse({ type: BudgetResponseDto })
  @ApiBadRequestResponse({
    description: 'Item ou status do orçamento inválido',
  })
  @ApiConflictResponse({
    description: 'O orçamento foi alterado por outra requisição',
  })
  @ApiNotFoundResponse({
    description:
      'Orçamento não encontrado, ou peça/serviço referenciado pelo item não existe',
  })
  async addItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBudgetItemDto,
  ): Promise<BudgetResponseDto> {
    return BudgetResponseMapper.toResponse(
      await this.addBudgetItem.execute(id, dto),
    );
  }

  @Delete(':id/items/:itemId')
  @ApiOperation({ summary: 'Remove um item do orçamento' })
  @ApiOkResponse({ type: BudgetResponseDto })
  @ApiBadRequestResponse({
    description: 'Item ou status do orçamento inválido',
  })
  @ApiConflictResponse({
    description: 'O orçamento foi alterado por outra requisição',
  })
  @ApiNotFoundResponse({ description: 'Orçamento não encontrado' })
  async removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<BudgetResponseDto> {
    return BudgetResponseMapper.toResponse(
      await this.removeBudgetItem.execute(id, itemId),
    );
  }

  @Get(':id/total')
  @ApiOperation({ summary: 'Calcula o total do orçamento' })
  @ApiOkResponse({ type: BudgetTotalResponseDto })
  @ApiNotFoundResponse({ description: 'Orçamento não encontrado' })
  async calculateTotal(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BudgetTotalResponseDto> {
    return {
      budgetId: id,
      totalAmount: await this.calculateBudgetTotal.execute(id),
    };
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Envia o orçamento ao cliente' })
  @ApiOkResponse({ type: BudgetResponseDto })
  @ApiBadRequestResponse({ description: 'Status do orçamento inválido' })
  @ApiConflictResponse({
    description: 'O orçamento foi alterado por outra requisição',
  })
  @ApiNotFoundResponse({ description: 'Orçamento não encontrado' })
  async send(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BudgetResponseDto> {
    return BudgetResponseMapper.toResponse(await this.sendBudget.execute(id));
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.EMPLOYEE, Role.CUSTOMER)
  @ApiOperation({
    summary: 'Aceita o orçamento',
    description:
      'O CUSTOMER só responde orçamento de OS própria; qualquer outro id ' +
      'responde 404.',
  })
  @ApiOkResponse({ type: BudgetResponseDto })
  @ApiBadRequestResponse({ description: 'Status do orçamento inválido' })
  @ApiConflictResponse({
    description: 'O orçamento foi alterado por outra requisição',
  })
  @ApiNotFoundResponse({ description: 'Orçamento não encontrado' })
  async accept(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<BudgetResponseDto> {
    return BudgetResponseMapper.toResponse(
      await this.acceptBudget.execute(id, clientScopeOf(user)),
    );
  }

  @Post(':id/refuse')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.EMPLOYEE, Role.CUSTOMER)
  @ApiOperation({
    summary: 'Recusa o orçamento',
    description:
      'O CUSTOMER só responde orçamento de OS própria; qualquer outro id ' +
      'responde 404.',
  })
  @ApiOkResponse({ type: BudgetResponseDto })
  @ApiBadRequestResponse({
    description: 'Motivo ou status do orçamento inválido',
  })
  @ApiConflictResponse({
    description: 'O orçamento foi alterado por outra requisição',
  })
  @ApiNotFoundResponse({ description: 'Orçamento não encontrado' })
  async refuse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefuseBudgetDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<BudgetResponseDto> {
    return BudgetResponseMapper.toResponse(
      await this.refuseBudget.execute(id, dto, clientScopeOf(user)),
    );
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.EMPLOYEE, Role.CUSTOMER)
  @ApiOperation({ summary: 'Busca um orçamento por id' })
  @ApiOkResponse({ type: BudgetResponseDto })
  @ApiNotFoundResponse({ description: 'Orçamento não encontrado' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<BudgetResponseDto> {
    return BudgetResponseMapper.toResponse(
      await this.findBudget.execute(id, clientScopeOf(user)),
    );
  }

  @Get()
  @Roles(Role.ADMIN, Role.EMPLOYEE, Role.CUSTOMER)
  @ApiOperation({
    summary: 'Lista orçamentos, opcionalmente os de uma ordem de serviço',
    description:
      'O CUSTOMER precisa informar serviceOrderId, de uma OS própria.',
  })
  @ApiOkResponse({ type: BudgetResponseDto, isArray: true })
  @ApiBadRequestResponse({ description: 'Filtro inválido' })
  @ApiNotFoundResponse({
    description: 'CUSTOMER pediu os orçamentos de uma OS que não é dele',
  })
  async findAll(
    @Query() query: FindBudgetsQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<BudgetResponseDto[]> {
    const clientScope = clientScopeOf(user);

    if (clientScope !== undefined && !query.serviceOrderId) {
      throw new BadRequestException(
        'Informe serviceOrderId para listar os orçamentos',
      );
    }

    if (query.serviceOrderId) {
      return BudgetResponseMapper.toResponseList(
        await this.listByServiceOrder.execute(
          query.serviceOrderId,
          clientScope,
        ),
      );
    }

    return BudgetResponseMapper.toResponseList(
      await this.listBudgets.execute(),
    );
  }
}

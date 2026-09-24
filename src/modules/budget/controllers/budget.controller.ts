import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  forwardRef,
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
} from '../dto/budget.dto';
import { BudgetMapper } from '../mappers/budget.mapper';
import { BudgetService } from '../services/budget.service';
import { Role } from '../../../../generated/prisma/enums';
import { Roles } from '../../../shared/http/auth/roles.decorator';
import {
  clientScopeOf,
  CurrentUser,
} from '../../../shared/http/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../../shared/http/auth/current-user.decorator';

@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token de acesso ausente ou inválido' })
@Roles(Role.ADMIN, Role.EMPLOYEE)
@ApiTags('budgets')
@Controller('budgets')
export class BudgetController {
  // O orçamento passou a consultar a peça referenciada por cada item, e o
  // despacho de peças já lia o orçamento aceito: orçamento e estoque agora se
  // referenciam em ciclo, e o forwardRef é o que deixa o Nest fechá-lo.
  constructor(
    @Inject(forwardRef(() => BudgetService))
    private readonly budgetService: BudgetService,
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
    return BudgetMapper.toResponse(await this.budgetService.create(dto));
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
    return BudgetMapper.toResponse(await this.budgetService.addItem(id, dto));
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
    return BudgetMapper.toResponse(
      await this.budgetService.removeItem(id, itemId),
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
      totalAmount: await this.budgetService.calculateTotal(id),
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
    return BudgetMapper.toResponse(await this.budgetService.send(id));
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
    return BudgetMapper.toResponse(
      await this.budgetService.accept(id, clientScopeOf(user)),
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
    return BudgetMapper.toResponse(
      await this.budgetService.refuse(id, dto, clientScopeOf(user)),
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
    return BudgetMapper.toResponse(
      await this.budgetService.findById(id, clientScopeOf(user)),
    );
  }

  /**
   * Também chamado pelo despacho de peças sem `user`: a chamada interna não
   * tem recorte, a autorização já aconteceu na entrada.
   */
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
      return BudgetMapper.toResponseList(
        await this.budgetService.findByServiceOrderId(
          query.serviceOrderId,
          clientScope,
        ),
      );
    }

    return BudgetMapper.toResponseList(await this.budgetService.findAll());
  }
}

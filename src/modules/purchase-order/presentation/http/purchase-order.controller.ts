import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '../../../../../generated/prisma/enums';
import { Roles } from '../../../../shared/http/auth/roles.decorator';
import {
  AddPurchaseOrderItemDto,
  CreatePurchaseOrderDto,
  RegisterShortageDto,
} from './dto/purchase-order.dto';
import { PurchaseOrderResponseMapper } from './mappers/purchase-order-response.mapper';
import { PurchaseOrder } from '../../domain/entities/purchase-order.entity';
import { AddPurchaseOrderItemUseCase } from '../../application/use-cases/add-purchase-order-item.use-case';
import { CreatePurchaseOrderUseCase } from '../../application/use-cases/create-purchase-order.use-case';
import { FindPurchaseOrderUseCase } from '../../application/use-cases/find-purchase-order.use-case';
import { ListPurchaseOrdersUseCase } from '../../application/use-cases/list-purchase-orders.use-case';
import { MarkPurchaseOrderDeliveredUseCase } from '../../application/use-cases/mark-purchase-order-delivered.use-case';
import { RegisterPurchaseUseCase } from '../../application/use-cases/register-purchase.use-case';
import { RegisterShortageUseCase } from '../../application/use-cases/register-shortage.use-case';
import { RemovePurchaseOrderItemUseCase } from '../../application/use-cases/remove-purchase-order-item.use-case';
import { ResolvePartNamesQuery } from '../../application/use-cases/resolve-part-names.query';

@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Roles(Role.ADMIN, Role.EMPLOYEE)
@ApiTags('purchase-orders')
@Controller('purchase-orders')
export class PurchaseOrderController {
  constructor(
    private readonly createPurchaseOrder: CreatePurchaseOrderUseCase,
    private readonly registerShortageUseCase: RegisterShortageUseCase,
    private readonly listPurchaseOrders: ListPurchaseOrdersUseCase,
    private readonly findPurchaseOrder: FindPurchaseOrderUseCase,
    private readonly addPurchaseOrderItem: AddPurchaseOrderItemUseCase,
    private readonly removePurchaseOrderItem: RemovePurchaseOrderItemUseCase,
    private readonly registerPurchaseUseCase: RegisterPurchaseUseCase,
    private readonly markDelivered: MarkPurchaseOrderDeliveredUseCase,
    private readonly resolvePartNames: ResolvePartNamesQuery,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Cria um pedido de compra' })
  @ApiResponse({
    status: 201,
    description: 'Pedido de compra criado com sucesso',
  })
  async create(@Body() dto: CreatePurchaseOrderDto) {
    return this.toResponse(await this.createPurchaseOrder.execute(dto));
  }

  @Post('shortages')
  @ApiOperation({
    summary: 'Registra necessidade de compra a partir da falta de estoque',
  })
  @ApiResponse({
    status: 201,
    description: 'Pedido de compra aberto em NEEDS_PURCHASE',
  })
  async registerShortage(@Body() dto: RegisterShortageDto) {
    return this.toResponse(await this.registerShortageUseCase.execute(dto));
  }

  @Get()
  @ApiOperation({ summary: 'Lista os pedidos de compra' })
  async findAll() {
    const purchaseOrders = await this.listPurchaseOrders.execute();

    return PurchaseOrderResponseMapper.toResponseList(
      purchaseOrders,
      await this.resolvePartNames.execute(purchaseOrders),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca um pedido de compra por id' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.toResponse(await this.findPurchaseOrder.execute(id));
  }

  @Post(':id/items')
  @ApiOperation({ summary: 'Adiciona um item ao pedido de compra' })
  async addItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddPurchaseOrderItemDto,
  ) {
    return this.toResponse(await this.addPurchaseOrderItem.execute(id, dto));
  }

  @Delete(':id/items/:itemId')
  @ApiOperation({ summary: 'Remove um item do pedido de compra' })
  async removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.toResponse(
      await this.removePurchaseOrderItem.execute(id, itemId),
    );
  }

  @Patch(':id/register-purchase')
  @ApiOperation({ summary: 'Registra a compra junto ao fornecedor' })
  async registerPurchase(@Param('id', ParseUUIDPipe) id: string) {
    return this.toResponse(await this.registerPurchaseUseCase.execute(id));
  }

  @Patch(':id/deliver')
  @ApiOperation({ summary: 'Registra a entrega do pedido de compra' })
  async markAsDelivered(@Param('id', ParseUUIDPipe) id: string) {
    return this.toResponse(await this.markDelivered.execute(id));
  }

  /** O nome da peça vem do estoque, pela query de nomes. */
  private async toResponse(purchaseOrder: PurchaseOrder) {
    return PurchaseOrderResponseMapper.toResponse(
      purchaseOrder,
      await this.resolvePartNames.execute([purchaseOrder]),
    );
  }
}

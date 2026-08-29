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

import {
  AddPurchaseOrderItemDto,
  CreatePurchaseOrderDto,
  RegisterShortageDto,
} from '../dto/purchase-order.dto';

import { PurchaseOrder } from '../entities/purchase-order.entity';
import { PurchaseOrderMapper } from '../mappers/purchase-order.mapper';

import { PurchaseOrderService } from '../services/purchase-order.service';
import { Role } from '../../../../generated/prisma/enums';
import { Roles } from '../../../shared/http/auth/roles.decorator';

@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Roles(Role.ADMIN, Role.EMPLOYEE)
@ApiTags('purchase-orders')
@Controller('purchase-orders')
export class PurchaseOrderController {
  constructor(private readonly service: PurchaseOrderService) {}

  @Post()
  @ApiOperation({
    summary: 'Cria um pedido de compra',
  })
  @ApiResponse({
    status: 201,
    description: 'Pedido de compra criado com sucesso',
  })
  async create(
    @Body()
    dto: CreatePurchaseOrderDto,
  ) {
    const purchaseOrder = await this.service.create(dto);

    return this.toResponse(purchaseOrder);
  }

  @Post('shortages')
  @ApiOperation({
    summary: 'Registra necessidade de compra a partir da falta de estoque',
  })
  @ApiResponse({
    status: 201,
    description: 'Pedido de compra aberto em NEEDS_PURCHASE',
  })
  async registerShortage(
    @Body()
    dto: RegisterShortageDto,
  ) {
    const purchaseOrder = await this.service.registerShortage(dto);

    return this.toResponse(purchaseOrder);
  }

  @Get()
  @ApiOperation({
    summary: 'Lista os pedidos de compra',
  })
  async findAll() {
    const purchaseOrders = await this.service.findAll();

    return PurchaseOrderMapper.toResponseList(
      purchaseOrders,
      await this.service.resolvePartNames(purchaseOrders),
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Busca um pedido de compra por id',
  })
  async findById(
    @Param('id', ParseUUIDPipe)
    id: string,
  ) {
    const purchaseOrder = await this.service.findById(id);

    return this.toResponse(purchaseOrder);
  }

  @Post(':id/items')
  @ApiOperation({
    summary: 'Adiciona um item ao pedido de compra',
  })
  async addItem(
    @Param('id', ParseUUIDPipe)
    id: string,

    @Body()
    dto: AddPurchaseOrderItemDto,
  ) {
    const purchaseOrder = await this.service.addItem(id, dto);

    return this.toResponse(purchaseOrder);
  }

  @Delete(':id/items/:itemId')
  @ApiOperation({
    summary: 'Remove um item do pedido de compra',
  })
  async removeItem(
    @Param('id', ParseUUIDPipe)
    id: string,

    @Param('itemId', ParseUUIDPipe)
    itemId: string,
  ) {
    const purchaseOrder = await this.service.removeItem(id, itemId);

    return this.toResponse(purchaseOrder);
  }

  @Patch(':id/register-purchase')
  @ApiOperation({
    summary: 'Registra a compra junto ao fornecedor',
  })
  async registerPurchase(
    @Param('id', ParseUUIDPipe)
    id: string,
  ) {
    const purchaseOrder = await this.service.registerPurchase(id);

    return this.toResponse(purchaseOrder);
  }

  @Patch(':id/deliver')
  @ApiOperation({
    summary: 'Registra a entrega do pedido de compra',
  })
  async markAsDelivered(
    @Param('id', ParseUUIDPipe)
    id: string,
  ) {
    const purchaseOrder = await this.service.markAsDelivered(id);

    return this.toResponse(purchaseOrder);
  }

  /**
   * O nome da peça vem do módulo de estoque, então o mapeamento precisa passar
   * pelo service, que é quem fala com o controller de lá.
   */
  private async toResponse(purchaseOrder: PurchaseOrder) {
    return PurchaseOrderMapper.toResponse(
      purchaseOrder,
      await this.service.resolvePartNames([purchaseOrder]),
    );
  }
}

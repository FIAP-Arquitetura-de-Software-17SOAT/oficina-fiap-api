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
    summary: 'Criar pedido de compra',
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

    return PurchaseOrderMapper.toResponse(purchaseOrder);
  }

  @Post('shortages')
  @ApiOperation({
    summary: 'Registrar necessidade de compra a partir da falta de estoque',
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

    return PurchaseOrderMapper.toResponse(purchaseOrder);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar pedidos de compra',
  })
  async findAll() {
    const purchaseOrders = await this.service.findAll();

    return purchaseOrders.map((purchaseOrder) =>
      PurchaseOrderMapper.toResponse(purchaseOrder),
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consultar pedido de compra por ID',
  })
  async findById(
    @Param('id', ParseUUIDPipe)
    id: string,
  ) {
    const purchaseOrder = await this.service.findById(id);

    return PurchaseOrderMapper.toResponse(purchaseOrder);
  }

  @Post(':id/items')
  @ApiOperation({
    summary: 'Adicionar item ao pedido de compra',
  })
  async addItem(
    @Param('id', ParseUUIDPipe)
    id: string,

    @Body()
    dto: AddPurchaseOrderItemDto,
  ) {
    const purchaseOrder = await this.service.addItem(id, dto);

    return PurchaseOrderMapper.toResponse(purchaseOrder);
  }

  @Delete(':id/items/:itemId')
  @ApiOperation({
    summary: 'Remover item do pedido de compra',
  })
  async removeItem(
    @Param('id', ParseUUIDPipe)
    id: string,

    @Param('itemId', ParseUUIDPipe)
    itemId: string,
  ) {
    const purchaseOrder = await this.service.removeItem(id, itemId);

    return PurchaseOrderMapper.toResponse(purchaseOrder);
  }

  @Patch(':id/register-purchase')
  @ApiOperation({
    summary: 'Registrar compra junto ao fornecedor',
  })
  async registerPurchase(
    @Param('id', ParseUUIDPipe)
    id: string,
  ) {
    const purchaseOrder = await this.service.registerPurchase(id);

    return PurchaseOrderMapper.toResponse(purchaseOrder);
  }

  @Patch(':id/deliver')
  @ApiOperation({
    summary: 'Registrar entrega do pedido de compra',
  })
  async markAsDelivered(
    @Param('id', ParseUUIDPipe)
    id: string,
  ) {
    const purchaseOrder = await this.service.markAsDelivered(id);

    return PurchaseOrderMapper.toResponse(purchaseOrder);
  }
}

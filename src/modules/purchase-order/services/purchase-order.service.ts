import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  AddPurchaseOrderItemDto,
  CreatePurchaseOrderDto,
} from '../dto/purchase-order.dto';

import {
  PurchaseOrder,
} from '../entities/purchase-order.entity';

import {
  PurchaseOrderItem,
} from '../entities/purchase-order-item.entity';

import {
  PurchaseOrderRepository,
} from '../repositories/purchase-order.repository';

import {
  Money,
} from '../value-objects/money.vo';

import {
  PurchaseOrderNumber,
} from '../value-objects/purchase-order-number.vo';

import {
  Quantity,
} from '../value-objects/quantity.vo';

@Injectable()
export class PurchaseOrderService {
  constructor(
    private readonly repository:
      PurchaseOrderRepository,
  ) {}

  async create(
    dto: CreatePurchaseOrderDto,
  ): Promise<PurchaseOrder> {
    const purchaseOrder =
      new PurchaseOrder({
        number:
          PurchaseOrderNumber
            .create(
              dto.number,
            ),

        supplier:
          dto.supplier,
      });

    return this.repository.create(
      purchaseOrder,
    );
  }

  async findAll():
    Promise<PurchaseOrder[]> {
    return this.repository.findAll();
  }

  async findById(
    id: string,
  ): Promise<PurchaseOrder> {
    const purchaseOrder =
      await this.repository
        .findById(id);

    if (!purchaseOrder) {
      throw new NotFoundException(
        'Pedido de compra não encontrado',
      );
    }

    return purchaseOrder;
  }

  async addItem(
    id: string,
    dto: AddPurchaseOrderItemDto,
  ): Promise<PurchaseOrder> {
    const purchaseOrder =
      await this.findById(id);

    const item =
      new PurchaseOrderItem({
        pecaId:
          dto.pecaId,

        quantity:
          Quantity.create(
            dto.quantity,
          ),

        unitPrice:
          Money.fromDecimal(
            dto.unitPrice,
          ),
      });

    purchaseOrder.addItem(item);

    return this.repository.update(
      purchaseOrder,
    );
  }

  async removeItem(
    id: string,
    itemId: string,
  ): Promise<PurchaseOrder> {
    const purchaseOrder =
      await this.findById(id);

    purchaseOrder.removeItem(
      itemId,
    );

    return this.repository.update(
      purchaseOrder,
    );
  }

  async registerPurchase(
    id: string,
  ): Promise<PurchaseOrder> {
    const purchaseOrder =
      await this.findById(id);

    purchaseOrder
      .registerPurchase();

    return this.repository.update(
      purchaseOrder,
    );
  }

  async markAsDelivered(
    id: string,
  ): Promise<PurchaseOrder> {
    const purchaseOrder =
      await this.findById(id);

    purchaseOrder
      .markAsDelivered();

    return this.repository.update(
      purchaseOrder,
    );
  }
}
import {
  Injectable,
} from '@nestjs/common';

import {
  PrismaService,
} from '../../../shared/database/prisma.service';

import {
  PurchaseOrder,
} from '../entities/purchase-order.entity';

import {
  PurchaseOrderItem,
} from '../entities/purchase-order-item.entity';

import {
  PurchaseOrderStatus,
} from '../enums/purchase-order-status.enum';

import {
  Money,
} from '../value-objects/money.vo';

import {
  PurchaseOrderNumber,
} from '../value-objects/purchase-order-number.vo';

import {
  Quantity,
} from '../value-objects/quantity.vo';

interface PurchaseOrderItemRow {
  id: string;

  purchaseOrderId: string;

  pecaId: string;

  quantity: number;

  unitPriceCents: number;
}

interface PurchaseOrderRow {
  id: string;

  number: string;

  supplier: string;

  status: string;

  createdAt: Date;

  updatedAt: Date;

  deliveredAt:
    Date | null;

  items:
    PurchaseOrderItemRow[];
}

@Injectable()
export class PurchaseOrderRepository {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  async create(
    purchaseOrder: PurchaseOrder,
  ): Promise<PurchaseOrder> {
    const row =
      await this.prisma
        .purchaseOrder
        .create({
          data: {
            id:
              purchaseOrder
                .getId(),

            number:
              purchaseOrder
                .getNumber()
                .value,

            supplier:
              purchaseOrder
                .getSupplier(),

            status:
              purchaseOrder
                .getStatus(),

            createdAt:
              purchaseOrder
                .getCreatedAt(),

            updatedAt:
              purchaseOrder
                .getUpdatedAt(),

            deliveredAt:
              purchaseOrder
                .getDeliveredAt(),
          },

          include: {
            items: true,
          },
        });

    return this.toDomain(row);
  }

  async findAll():
    Promise<PurchaseOrder[]> {
    const rows =
      await this.prisma
        .purchaseOrder
        .findMany({
          include: {
            items: true,
          },

          orderBy: {
            createdAt: 'desc',
          },
        });

    return rows.map(
      (row) =>
        this.toDomain(row),
    );
  }

  async findById(
    id: string,
  ): Promise<
    PurchaseOrder | null
  > {
    const row =
      await this.prisma
        .purchaseOrder
        .findUnique({
          where: {
            id,
          },

          include: {
            items: true,
          },
        });

    if (!row) {
      return null;
    }

    return this.toDomain(row);
  }

  async update(
    purchaseOrder: PurchaseOrder,
  ): Promise<PurchaseOrder> {
    const row =
      await this.prisma
        .purchaseOrder
        .update({
          where: {
            id:
              purchaseOrder
                .getId(),
          },

          data: {
            status:
              purchaseOrder
                .getStatus(),

            updatedAt:
              purchaseOrder
                .getUpdatedAt(),

            deliveredAt:
              purchaseOrder
                .getDeliveredAt(),

            items: {
              deleteMany: {},

              create:
                purchaseOrder
                  .getItems()
                  .map(
                    (item) => ({
                      id:
                        item.getId(),

                      pecaId:
                        item
                          .getPecaId(),

                      quantity:
                        item
                          .getQuantity()
                          .value,

                      unitPriceCents:
                        item
                          .getUnitPrice()
                          .valueInCents,
                    }),
                  ),
            },
          },

          include: {
            items: true,
          },
        });

    return this.toDomain(row);
  }

  private toDomain(
    row: PurchaseOrderRow,
  ): PurchaseOrder {
    const items =
      row.items.map(
        (item) =>
          new PurchaseOrderItem({
            id:
              item.id,

            pecaId:
              item.pecaId,

            quantity:
              Quantity.create(
                item.quantity,
              ),

            unitPrice:
              Money.fromCents(
                item
                  .unitPriceCents,
              ),
          }),
      );

    return new PurchaseOrder({
      id:
        row.id,

      number:
        PurchaseOrderNumber
          .create(
            row.number,
          ),

      supplier:
        row.supplier,

      status:
        row.status as
          PurchaseOrderStatus,

      items,

      createdAt:
        row.createdAt,

      updatedAt:
        row.updatedAt,

      deliveredAt:
        row.deliveredAt ??
        undefined,
    });
  }
}
import { ConflictException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/database/prisma.service';
import { isUniqueViolation } from '../../../shared/database/prisma-errors';

import { PurchaseOrder } from '../entities/purchase-order.entity';

import { PurchaseOrderItem } from '../entities/purchase-order-item.entity';

import { PurchaseOrderStatus } from '../enums/purchase-order-status.enum';

import { Money } from '../../../shared/domain/value-objects/money.vo';

import { PurchaseOrderNumber } from '../value-objects/purchase-order-number.vo';

import { Quantity } from '../../../shared/domain/value-objects/quantity.vo';

interface PurchaseOrderItemRow {
  id: string;

  purchaseOrderId: string;

  partId: string;

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

  deliveredAt: Date | null;

  items: PurchaseOrderItemRow[];
}

@Injectable()
export class PurchaseOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(purchaseOrder: PurchaseOrder): Promise<PurchaseOrder> {
    try {
      const row = await this.prisma.purchaseOrder.create({
        data: {
          id: purchaseOrder.getId(),

          number: purchaseOrder.getNumber().value,

          supplier: purchaseOrder.getSupplier(),

          status: purchaseOrder.getStatus(),

          createdAt: purchaseOrder.getCreatedAt(),

          updatedAt: purchaseOrder.getUpdatedAt(),

          deliveredAt: purchaseOrder.getDeliveredAt(),

          // Pedidos abertos pela politica de necessidade de compra ja nascem com
          // itens; os criados pela API nascem vazios e o map fica sem elementos.
          items: {
            create: purchaseOrder.getItems().map((item) => ({
              id: item.getId(),

              partId: item.getPartId(),

              quantity: item.getQuantity().getValue(),

              unitPriceCents: item.getUnitPrice().valueInCents,
            })),
          },
        },

        include: {
          items: true,
        },
      });

      return this.toDomain(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Purchase order number already exists');
      }

      throw error;
    }
  }

  /**
   * Base do sequencial de `PC-AAAA-NNNN` nos pedidos abertos automaticamente
   * pela politica de necessidade de compra.
   */
  async countByYear(year: number): Promise<number> {
    return this.prisma.purchaseOrder.count({
      where: { number: { startsWith: `PC-${year}-` } },
    });
  }

  async findAll(): Promise<PurchaseOrder[]> {
    const rows = await this.prisma.purchaseOrder.findMany({
      include: {
        items: true,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });

    return rows.map((row) => this.toDomain(row));
  }

  async findById(id: string): Promise<PurchaseOrder | null> {
    const row = await this.prisma.purchaseOrder.findUnique({
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

  async update(purchaseOrder: PurchaseOrder): Promise<PurchaseOrder> {
    const row = await this.prisma.purchaseOrder.update({
      where: {
        id: purchaseOrder.getId(),
      },

      data: {
        status: purchaseOrder.getStatus(),

        updatedAt: purchaseOrder.getUpdatedAt(),

        deliveredAt: purchaseOrder.getDeliveredAt(),

        items: {
          deleteMany: {},

          create: purchaseOrder.getItems().map((item) => ({
            id: item.getId(),

            partId: item.getPartId(),

            quantity: item.getQuantity().getValue(),

            unitPriceCents: item.getUnitPrice().valueInCents,
          })),
        },
      },

      include: {
        items: true,
      },
    });

    return this.toDomain(row);
  }

  private toDomain(row: PurchaseOrderRow): PurchaseOrder {
    const items = row.items.map(
      (item) =>
        new PurchaseOrderItem({
          id: item.id,

          partId: item.partId,

          quantity: Quantity.positive(item.quantity),

          unitPrice: Money.fromCents(item.unitPriceCents),
        }),
    );

    return new PurchaseOrder({
      id: row.id,

      number: PurchaseOrderNumber.create(row.number),

      supplier: row.supplier,

      status: row.status as PurchaseOrderStatus,

      items,

      createdAt: row.createdAt,

      updatedAt: row.updatedAt,

      deliveredAt: row.deliveredAt ?? undefined,
    });
  }
}

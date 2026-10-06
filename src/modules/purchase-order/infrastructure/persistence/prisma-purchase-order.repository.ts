import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { isUniqueViolation } from '../../../../shared/database/prisma-errors';
import { PurchaseOrder } from '../../domain/entities/purchase-order.entity';
import { PurchaseOrderApplicationError } from '../../application/errors/purchase-order-application.error';
import { PurchaseOrderRepositoryPort } from '../../application/ports/purchase-order-repository.port';
import { PurchaseOrderPersistenceMapper } from './purchase-order-persistence.mapper';

@Injectable()
export class PrismaPurchaseOrderRepository implements PurchaseOrderRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(purchaseOrder: PurchaseOrder): Promise<PurchaseOrder> {
    try {
      const row = await this.prisma.purchaseOrder.create({
        data: PurchaseOrderPersistenceMapper.toCreate(purchaseOrder),
        include: { items: true },
      });
      return PurchaseOrderPersistenceMapper.toDomain(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new PurchaseOrderApplicationError('PURCHASE_ORDER_NUMBER_IN_USE');
      }
      throw error;
    }
  }

  async countByYear(year: number): Promise<number> {
    return this.prisma.purchaseOrder.count({
      where: { number: { startsWith: `PC-${year}-` } },
    });
  }

  async findAll(): Promise<PurchaseOrder[]> {
    const rows = await this.prisma.purchaseOrder.findMany({
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => PurchaseOrderPersistenceMapper.toDomain(row));
  }

  async findById(id: string): Promise<PurchaseOrder | null> {
    const row = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: true },
    });
    return row ? PurchaseOrderPersistenceMapper.toDomain(row) : null;
  }

  async update(purchaseOrder: PurchaseOrder): Promise<PurchaseOrder> {
    const row = await this.prisma.purchaseOrder.update({
      where: { id: purchaseOrder.getId() },
      data: PurchaseOrderPersistenceMapper.toUpdate(purchaseOrder),
      include: { items: true },
    });
    return PurchaseOrderPersistenceMapper.toDomain(row);
  }
}

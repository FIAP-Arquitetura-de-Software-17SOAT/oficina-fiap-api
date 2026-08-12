import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { Budget, BudgetItemType, BudgetStatus } from '../entities/budget.entity';
import { BudgetMapper } from '../mappers/budget.mapper';

type BudgetRecord = Prisma.BudgetGetPayload<{ include: { items: true } }>;

@Injectable()
export class BudgetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(budget: Budget): Promise<Budget> {
    const created = await this.prisma.budget.create({
      data: BudgetMapper.toPersistence(budget),
      include: { items: true },
    });

    return this.toDomain(created);
  }

  async update(budget: Budget): Promise<Budget> {
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.budgetItem.deleteMany({ where: { budgetId: budget.getId() } });

      return tx.budget.update({
        where: { id: budget.getId() },
        include: { items: true },
        data: {
          status: budget.getStatus(),
          totalAmount: budget.getTotalAmount(),
          refusalReason: budget.getRefusalReason(),
          sentAt: budget.getSentAt(),
          answeredAt: budget.getAnsweredAt(),
          items: {
            create: budget.getItems().map((item) => ({
              id: item.getId(),
              description: item.getDescription(),
              type: item.getType(),
              quantity: item.getQuantity(),
              unitPrice: item.getUnitPrice(),
              subtotal: item.getSubtotal(),
            })),
          },
        },
      });
    });

    return this.toDomain(updated);
  }

  async findById(id: string): Promise<Budget | null> {
    const record = await this.prisma.budget.findUnique({
      where: { id },
      include: { items: true },
    });

    return record ? this.toDomain(record) : null;
  }

  async findByServiceOrderId(serviceOrderId: string): Promise<Budget[]> {
    const records = await this.prisma.budget.findMany({
      where: { serviceOrderId },
      include: { items: true },
    });

    return records.map((record) => this.toDomain(record));
  }

  async findLastVersionByServiceOrderId(
    serviceOrderId: string,
  ): Promise<number> {
    const record = await this.prisma.budget.findFirst({
      where: { serviceOrderId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    return record?.version ?? 0;
  }

  private toDomain(record: BudgetRecord): Budget {
    return BudgetMapper.toDomain({
      ...record,
      status: record.status as BudgetStatus,
      items: record.items.map((item) => ({
        ...item,
        type: item.type as BudgetItemType,
      })),
    });
  }
}

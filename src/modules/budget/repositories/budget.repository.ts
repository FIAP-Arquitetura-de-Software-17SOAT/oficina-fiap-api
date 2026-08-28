import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import {
  Budget,
  BudgetItemType,
  BudgetStatus,
} from '../entities/budget.entity';
import { BudgetMapper } from '../mappers/budget.mapper';
import { Money } from '../../../shared/domain/value-objects/money.vo';

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

  async updateGenerated(
    budget: Budget,
    expectedUpdatedAt: Date,
  ): Promise<Budget | null> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.budget.updateMany({
        where: {
          id: budget.getId(),
          status: BudgetStatus.GENERATED,
          updatedAt: expectedUpdatedAt,
        },
        data: this.toUpdateData(budget),
      });

      if (result.count === 0) {
        return null;
      }

      await tx.budgetItem.deleteMany({ where: { budgetId: budget.getId() } });
      await tx.budgetItem.createMany({
        data: budget.getItems().map((item) => ({
          ...BudgetMapper.itemToPersistence(item),
          budgetId: budget.getId(),
        })),
      });

      return tx.budget.findUnique({
        where: { id: budget.getId() },
        include: { items: true },
      });
    });

    return updated ? this.toDomain(updated) : null;
  }

  async updateWaitingApproval(
    budget: Budget,
    expectedUpdatedAt: Date,
  ): Promise<Budget | null> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.budget.updateMany({
        where: {
          id: budget.getId(),
          status: BudgetStatus.WAITING_APPROVAL,
          updatedAt: expectedUpdatedAt,
        },
        data: this.toUpdateData(budget),
      });

      if (result.count === 0) {
        return null;
      }

      return tx.budget.findUnique({
        where: { id: budget.getId() },
        include: { items: true },
      });
    });

    return updated ? this.toDomain(updated) : null;
  }

  async findById(id: string): Promise<Budget | null> {
    const record = await this.prisma.budget.findUnique({
      where: { id },
      include: { items: true },
    });

    return record ? this.toDomain(record) : null;
  }

  async findAll(): Promise<Budget[]> {
    const records = await this.prisma.budget.findMany({
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });

    return records.map((record) => this.toDomain(record));
  }

  async findByServiceOrderId(serviceOrderId: string): Promise<Budget[]> {
    const records = await this.prisma.budget.findMany({
      where: { serviceOrderId },
      include: { items: true },
      orderBy: { version: 'asc' },
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

  private toUpdateData(budget: Budget) {
    return {
      status: budget.getStatus(),
      totalCents: Money.fromDecimal(budget.getTotalAmount()).valueInCents,
      refusalReason: budget.getRefusalReason(),
      sentAt: budget.getSentAt(),
      answeredAt: budget.getAnsweredAt(),
      updatedAt: budget.getUpdatedAt(),
    };
  }
}

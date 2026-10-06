import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import {
  isUniqueViolation,
  uniqueViolationFields,
} from '../../../../shared/database/prisma-errors';
import { Budget, BudgetStatus } from '../../domain/entities/budget.entity';
import { BudgetApplicationError } from '../../application/errors/budget-application.error';
import { BudgetRepositoryPort } from '../../application/ports/budget-repository.port';
import { BudgetPersistenceMapper } from './budget-persistence.mapper';

const include = { items: true } as const;

@Injectable()
export class PrismaBudgetRepository implements BudgetRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(budget: Budget): Promise<Budget> {
    try {
      const created = await this.prisma.budget.create({
        data: BudgetPersistenceMapper.toCreate(budget),
        include,
      });
      return BudgetPersistenceMapper.toDomain(created);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      // A versão é alocada por leitura + gravação; duas requisições podem ler o
      // mesmo "último número". O banco decide quem perdeu, e o caso de uso tenta
      // a próxima versão. Qualquer outra unicidade é falha de alocação.
      const fields = uniqueViolationFields(error);
      const versionRace =
        fields.some((field) => field.includes('serviceOrderId')) &&
        fields.some((field) => field.includes('version'));
      throw new BudgetApplicationError(
        versionRace ? 'BUDGET_VERSION_TAKEN' : 'BUDGET_VERSION_ALLOCATION',
      );
    }
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
        data: BudgetPersistenceMapper.toUpdate(budget),
      });
      if (result.count === 0) return null;

      await tx.budgetItem.deleteMany({ where: { budgetId: budget.getId() } });
      await tx.budgetItem.createMany({
        data: budget.getItems().map((item) => ({
          ...BudgetPersistenceMapper.itemToPersistence(item),
          budgetId: budget.getId(),
        })),
      });

      return tx.budget.findUnique({ where: { id: budget.getId() }, include });
    });

    return updated ? BudgetPersistenceMapper.toDomain(updated) : null;
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
        data: BudgetPersistenceMapper.toUpdate(budget),
      });
      if (result.count === 0) return null;

      return tx.budget.findUnique({ where: { id: budget.getId() }, include });
    });

    return updated ? BudgetPersistenceMapper.toDomain(updated) : null;
  }

  async findById(id: string): Promise<Budget | null> {
    const record = await this.prisma.budget.findUnique({
      where: { id },
      include,
    });
    return record ? BudgetPersistenceMapper.toDomain(record) : null;
  }

  async findByApprovalTokenHash(hash: string): Promise<Budget | null> {
    const record = await this.prisma.budget.findUnique({
      where: { approvalTokenHash: hash },
      include,
    });
    return record ? BudgetPersistenceMapper.toDomain(record) : null;
  }

  async findAll(): Promise<Budget[]> {
    const records = await this.prisma.budget.findMany({
      include,
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => BudgetPersistenceMapper.toDomain(record));
  }

  async findByServiceOrderId(serviceOrderId: string): Promise<Budget[]> {
    const records = await this.prisma.budget.findMany({
      where: { serviceOrderId },
      include,
      orderBy: { version: 'desc' },
    });
    return records.map((record) => BudgetPersistenceMapper.toDomain(record));
  }

  async findWaitingApprovalByServiceOrderId(
    serviceOrderId: string,
  ): Promise<Budget | null> {
    const record = await this.prisma.budget.findFirst({
      where: { serviceOrderId, status: BudgetStatus.WAITING_APPROVAL },
      include,
      orderBy: { version: 'desc' },
    });
    return record ? BudgetPersistenceMapper.toDomain(record) : null;
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
}

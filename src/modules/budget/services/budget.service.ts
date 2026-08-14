import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateBudgetDto,
  CreateBudgetItemDto,
  RefuseBudgetDto,
} from '../dto/budget.dto';
import { Budget } from '../entities/budget.entity';
import { BudgetRepository } from '../repositories/budget.repository';

@Injectable()
export class BudgetService {
  private static readonly MAX_VERSION_ALLOCATION_ATTEMPTS = 3;

  constructor(private readonly budgetRepository: BudgetRepository) {}

  async create(dto: CreateBudgetDto): Promise<Budget> {
    for (
      let attempt = 0;
      attempt < BudgetService.MAX_VERSION_ALLOCATION_ATTEMPTS;
      attempt += 1
    ) {
      const lastVersion =
        await this.budgetRepository.findLastVersionByServiceOrderId(
          dto.serviceOrderId,
        );
      const budget = Budget.create({
        serviceOrderId: dto.serviceOrderId,
        version: lastVersion + 1,
        items: dto.items,
      });

      try {
        return await this.budgetRepository.create(budget);
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) {
          throw error;
        }

        if (
          this.isVersionUniqueConstraintError(error) &&
          attempt < BudgetService.MAX_VERSION_ALLOCATION_ATTEMPTS - 1
        ) {
          continue;
        }

        throw new ConflictException('Could not allocate budget version');
      }
    }

    throw new ConflictException('Could not allocate budget version');
  }

  async addItem(id: string, dto: CreateBudgetItemDto): Promise<Budget> {
    const budget = await this.findById(id);
    const expectedUpdatedAt = budget.getUpdatedAt();
    budget.addItem(dto);
    return this.persistGeneratedChange(budget, expectedUpdatedAt);
  }

  async removeItem(id: string, itemId: string): Promise<Budget> {
    const budget = await this.findById(id);
    const expectedUpdatedAt = budget.getUpdatedAt();
    budget.removeItem(itemId);
    return this.persistGeneratedChange(budget, expectedUpdatedAt);
  }

  async calculateTotal(id: string): Promise<number> {
    const budget = await this.findById(id);
    return budget.getTotalAmount();
  }

  async send(id: string): Promise<Budget> {
    const budget = await this.findById(id);
    const expectedUpdatedAt = budget.getUpdatedAt();
    budget.sendToCustomer();
    return this.persistGeneratedChange(budget, expectedUpdatedAt);
  }

  async accept(id: string): Promise<Budget> {
    const budget = await this.findById(id);
    const expectedUpdatedAt = budget.getUpdatedAt();
    budget.accept();
    return this.persistWaitingApprovalDecision(budget, expectedUpdatedAt);
  }

  async refuse(id: string, dto: RefuseBudgetDto): Promise<Budget> {
    const budget = await this.findById(id);
    const expectedUpdatedAt = budget.getUpdatedAt();
    budget.refuse(dto.reason);
    return this.persistWaitingApprovalDecision(budget, expectedUpdatedAt);
  }

  async findById(id: string): Promise<Budget> {
    const budget = await this.budgetRepository.findById(id);

    if (!budget) {
      throw new NotFoundException('Budget not found');
    }

    return budget;
  }

  async findByServiceOrderId(serviceOrderId: string): Promise<Budget[]> {
    return this.budgetRepository.findByServiceOrderId(serviceOrderId);
  }

  private async persistGeneratedChange(
    budget: Budget,
    expectedUpdatedAt: Date,
  ): Promise<Budget> {
    const updated = await this.budgetRepository.updateGenerated(
      budget,
      expectedUpdatedAt,
    );

    if (!updated) {
      throw new ConflictException(
        'Budget status was changed by another request',
      );
    }

    return updated;
  }

  private async persistWaitingApprovalDecision(
    budget: Budget,
    expectedUpdatedAt: Date,
  ): Promise<Budget> {
    const updated = await this.budgetRepository.updateWaitingApproval(
      budget,
      expectedUpdatedAt,
    );

    if (!updated) {
      throw new ConflictException(
        'Budget status was changed by another request',
      );
    }

    return updated;
  }

  private isUniqueConstraintError(error: unknown): error is { code: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private isVersionUniqueConstraintError(error: unknown): boolean {
    if (!this.isUniqueConstraintError(error)) {
      return false;
    }

    const fields = this.getUniqueConstraintFields(error);
    return (
      fields.some((field) => field.includes('serviceOrderId')) &&
      fields.some((field) => field.includes('version'))
    );
  }

  private getUniqueConstraintFields(error: unknown): string[] {
    if (typeof error !== 'object' || error === null || !('meta' in error)) {
      return [];
    }

    const meta = error.meta as {
      target?: unknown;
      driverAdapterError?: {
        cause?: { constraint?: { fields?: unknown } };
      };
    };
    const fields =
      meta.driverAdapterError?.cause?.constraint?.fields ?? meta.target;

    if (Array.isArray(fields)) {
      return fields.filter(
        (field): field is string => typeof field === 'string',
      );
    }

    return typeof fields === 'string' ? [fields] : [];
  }
}

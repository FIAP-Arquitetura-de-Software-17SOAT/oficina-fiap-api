import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CreateBudgetDto,
  CreateBudgetItemDto,
  RefuseBudgetDto,
} from '../dto/budget.dto';
import { Budget } from '../entities/budget.entity';
import { BudgetRepository } from '../repositories/budget.repository';

@Injectable()
export class BudgetService {
  constructor(private readonly budgetRepository: BudgetRepository) {}

  async create(dto: CreateBudgetDto): Promise<Budget> {
    const lastVersion =
      await this.budgetRepository.findLastVersionByServiceOrderId(
        dto.serviceOrderId,
      );
    const budget = Budget.create({
      serviceOrderId: dto.serviceOrderId,
      version: lastVersion + 1,
      items: dto.items,
    });

    return this.budgetRepository.create(budget);
  }

  async addItem(id: string, dto: CreateBudgetItemDto): Promise<Budget> {
    const budget = await this.findById(id);
    budget.addItem(dto);
    return this.budgetRepository.update(budget);
  }

  async removeItem(id: string, itemId: string): Promise<Budget> {
    const budget = await this.findById(id);
    budget.removeItem(itemId);
    return this.budgetRepository.update(budget);
  }

  async calculateTotal(id: string): Promise<number> {
    const budget = await this.findById(id);
    return budget.getTotalAmount();
  }

  async send(id: string): Promise<Budget> {
    const budget = await this.findById(id);
    budget.sendToCustomer();
    return this.budgetRepository.update(budget);
  }

  async accept(id: string): Promise<Budget> {
    const budget = await this.findById(id);
    budget.accept();
    return this.budgetRepository.update(budget);
  }

  async refuse(id: string, dto: RefuseBudgetDto): Promise<Budget> {
    const budget = await this.findById(id);
    budget.refuse(dto.reason);
    return this.budgetRepository.update(budget);
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
}

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUniqueViolation } from '../../../shared/database/prisma-errors';
import { BudgetStatus } from '../../budget/entities/budget.entity';
import { BudgetService } from '../../budget/services/budget.service';
import { ServiceOrderStatus } from '../../service-order/enums/service-order-status.enum';
import { ServiceOrderService } from '../../service-order/services/service-order.service';
import {
  GenerateBillingDto,
  RegisterPaymentDto,
} from '../dto/billing.dto';
import { Billing } from '../entities/billing.entity';
import { BillingStatus } from '../enums/billing-status.enum';
import { BillingRepository } from '../repositories/billing.repository';
import { PaymentAmount } from '../value-objects/payment-amount.vo';

@Injectable()
export class BillingService {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly budgetService: BudgetService,
    private readonly serviceOrderService: ServiceOrderService,
  ) {}

  async generateForServiceOrder(dto: GenerateBillingDto): Promise<Billing> {
    const serviceOrderId = dto.serviceOrderId.trim();
    const serviceOrder = await this.serviceOrderService.findById(serviceOrderId);

    if (serviceOrder.getStatus() !== ServiceOrderStatus.COMPLETED) {
      throw new ConflictException(
        'Service order must be completed before billing',
      );
    }

    const existing =
      await this.billingRepository.findByServiceOrderId(serviceOrderId);

    if (existing) {
      throw new ConflictException('Billing already exists for service order');
    }

    const budgets =
      await this.budgetService.findByServiceOrderId(serviceOrderId);
    const acceptedBudget = budgets
      .filter((budget) => budget.getStatus() === BudgetStatus.ACCEPTED)
      .sort((a, b) => b.getVersion() - a.getVersion())[0];

    if (!acceptedBudget) {
      throw new ConflictException('Accepted budget is required before billing');
    }

    const billing = Billing.create({
      serviceOrderId,
      totalAmountInCents: Math.round(acceptedBudget.getTotalAmount() * 100),
    });

    try {
      return await this.billingRepository.create(billing);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Billing already exists for service order');
      }

      throw error;
    }
  }

  async findById(id: string): Promise<Billing> {
    const billing = await this.billingRepository.findById(id);

    if (!billing) {
      throw new NotFoundException('Billing not found');
    }

    return billing;
  }

  async findByServiceOrderId(serviceOrderId: string): Promise<Billing> {
    const billing = await this.billingRepository.findByServiceOrderId(
      serviceOrderId.trim(),
    );

    if (!billing) {
      throw new NotFoundException('Billing not found');
    }

    return billing;
  }

  async findAll(): Promise<Billing[]> {
    return this.billingRepository.findAll();
  }

  async registerPayment(
    id: string,
    dto: RegisterPaymentDto,
  ): Promise<Billing> {
    const billing = await this.findById(id);
    const expectedUpdatedAt = new Date(billing.getUpdatedAt());

    billing.registerPayment({
      amount: PaymentAmount.fromDecimal(dto.amount),
      method: dto.method,
    });

    return this.persistUpdatedBilling(billing, expectedUpdatedAt);
  }

  async cancel(id: string): Promise<Billing> {
    const billing = await this.findById(id);
    const expectedUpdatedAt = new Date(billing.getUpdatedAt());

    billing.cancel();

    return this.persistUpdatedBilling(billing, expectedUpdatedAt);
  }

  async deliverServiceOrder(id: string): Promise<void> {
    const billing = await this.findById(id);

    if (billing.getStatus() !== BillingStatus.PAID) {
      throw new ConflictException('Billing must be paid before delivery');
    }

    await this.serviceOrderService.deliver(billing.getServiceOrderId());
  }

  private async persistUpdatedBilling(
    billing: Billing,
    expectedUpdatedAt: Date,
  ): Promise<Billing> {
    const updated = await this.billingRepository.update(
      billing,
      expectedUpdatedAt,
    );

    if (!updated) {
      throw new ConflictException('Billing was changed by another request');
    }

    return updated;
  }
}

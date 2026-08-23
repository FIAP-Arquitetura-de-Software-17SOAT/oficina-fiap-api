import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUniqueViolation } from '../../../shared/database/prisma-errors';
import { Money } from '../../../shared/domain/value-objects/money.vo';
import { BudgetStatus } from '../../budget/entities/budget.entity';
import { BudgetService } from '../../budget/services/budget.service';
import { ServiceOrderStatus } from '../../service-order/enums/service-order-status.enum';
import { ServiceOrderService } from '../../service-order/services/service-order.service';
import { GenerateBillingDto } from '../dto/billing.dto';
import { Billing } from '../entities/billing.entity';
import { BillingStatus } from '../enums/billing-status.enum';
import { PaymentGateway } from '../gateways/payment-gateway';
import { BillingRepository } from '../repositories/billing.repository';

@Injectable()
export class BillingService {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly budgetService: BudgetService,
    private readonly serviceOrderService: ServiceOrderService,
    private readonly paymentGateway: PaymentGateway,
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
      if (existing.getStatus() === BillingStatus.PENDING) {
        return this.createAndPersistPaymentLink(existing);
      }
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
      budgetId: acceptedBudget.getId(),
      amount: Money.fromDecimal(acceptedBudget.getTotalAmount()),
    });

    try {
      const created = await this.billingRepository.create(billing);
      return await this.createAndPersistPaymentLink(created);
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

  async expire(id: string): Promise<Billing> {
    const billing = await this.findById(id);
    const expectedUpdatedAt = new Date(billing.getUpdatedAt());

    billing.expire();

    return this.persistUpdatedBilling(billing, expectedUpdatedAt);
  }

  async handlePaymentWebhook(
    payload: Buffer | string,
    signature: string,
  ): Promise<void> {
    const event = await this.paymentGateway.parsePaymentWebhook({
      payload,
      signature,
    });
    if (event.type === 'ignored') return;

    const billing = await this.billingRepository.findByGatewayTransactionId(
      event.gatewayTransactionId,
    );
    if (!billing) throw new NotFoundException('Billing not found');

    const expectedUpdatedAt = new Date(billing.getUpdatedAt());
    const changed = billing.registerPayment({
      gatewayTransactionId: event.gatewayTransactionId,
      method: event.method,
      paidAt: event.paidAt,
    });
    if (!changed) return;

    await this.persistUpdatedBilling(billing, expectedUpdatedAt);
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

  private async createAndPersistPaymentLink(
    billing: Billing,
  ): Promise<Billing> {
    const link = await this.paymentGateway.createPaymentLink({
      billingId: billing.getId(),
      serviceOrderId: billing.getServiceOrderId(),
      amountInCents: billing.getAmount().valueInCents,
    });
    const expectedUpdatedAt = new Date(billing.getUpdatedAt());
    billing.generatePaymentLink(link);
    return this.persistUpdatedBilling(billing, expectedUpdatedAt);
  }
}

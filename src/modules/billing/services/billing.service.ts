import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUniqueViolation } from '../../../shared/database/prisma-errors';
import { Money } from '../../../shared/domain/value-objects/money.vo';
import { BudgetStatus } from '../../budget/entities/budget.entity';
import { BudgetService } from '../../budget/services/budget.service';
import { ClientRepository } from '../../client/repositories/client.repository';
import { NotificationType } from '../../notification/enums/notification-type.enum';
import { NotificationService } from '../../notification/services/notification.service';
import { ServiceOrderStatus } from '../../service-order/enums/service-order-status.enum';
import { ServiceOrderService } from '../../service-order/services/service-order.service';
import { GenerateBillingDto } from '../dto/billing.dto';
import { Billing } from '../entities/billing.entity';
import { BillingStatus } from '../enums/billing-status.enum';
import {
  InvalidPaymentWebhookSignatureError,
  PaymentGateway,
} from '../gateways/payment-gateway';
import { BillingRepository } from '../repositories/billing.repository';

@Injectable()
export class BillingService {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly budgetService: BudgetService,
    private readonly serviceOrderService: ServiceOrderService,
    private readonly paymentGateway: PaymentGateway,
    private readonly clientRepository: ClientRepository,
    private readonly notifications: NotificationService,
  ) {}

  async generateForServiceOrder(dto: GenerateBillingDto): Promise<Billing> {
    const serviceOrderId = dto.serviceOrderId.trim();
    const serviceOrder =
      await this.serviceOrderService.findById(serviceOrderId);

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

  private async enqueuePaymentLinkReadyNotification(
    billing: Billing,
  ): Promise<void> {
    try {
      const serviceOrder = await this.serviceOrderService.findById(
        billing.getServiceOrderId(),
      );
      const client = await this.clientRepository.findById(
        serviceOrder.getClientId(),
      );
      const paymentLink = billing.getPaymentLink();

      if (!client || !paymentLink) return;

      const total = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(billing.getAmount().value);
      const serviceOrderId = billing.getServiceOrderId();

      await this.notifications.enqueue({
        type: NotificationType.PAYMENT_LINK_READY,
        to: client.getEmail().getValue(),
        subject: `Link de pagamento disponível para a OS ${serviceOrderId}`,
        text: [
          `O serviço da ordem ${serviceOrderId} foi concluído.`,
          `Valor para pagamento: ${total}.`,
          '',
          `Pague pelo link: ${paymentLink}`,
        ].join('\n'),
        html: [
          `<p>O serviço da ordem ${this.escapeHtml(serviceOrderId)} foi concluído.</p>`,
          `<p>Valor para pagamento: <strong>${this.escapeHtml(total)}</strong>.</p>`,
          `<p><a href="${this.escapeHtml(paymentLink)}">Pagar agora</a></p>`,
        ].join(''),
      });
    } catch {
      // A cobrança e o link já foram persistidos; falhas de notificação não
      // podem alterar esse resultado de negócio.
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async renewPaymentLink(id: string, now = new Date()): Promise<Billing> {
    const billing = await this.findById(id);
    if (billing.getStatus() === BillingStatus.PAID) {
      throw new ConflictException('Paid billing is terminal');
    }

    const penalty = billing.calculatePenalty(now);
    if (!penalty) {
      throw new BadRequestException('Billing payment link has not expired yet');
    }

    const expectedUpdatedAt = new Date(billing.getUpdatedAt());
    const link = await this.paymentGateway.createPaymentLink({
      billingId: billing.getId(),
      serviceOrderId: billing.getServiceOrderId(),
      amountInCents: penalty.getTotalAmount().valueInCents,
      idempotencyKey: this.createPaymentLinkIdempotencyKey(billing.getId()),
    });
    await this.billingRepository.registerCheckoutSession(
      billing.getId(),
      link.gatewayTransactionId,
    );
    billing.renewPaymentLink(link, now);

    return this.persistUpdatedBilling(billing, expectedUpdatedAt);
  }

  async handlePaymentWebhook(
    payload: Buffer | string,
    signature: string,
  ): Promise<void> {
    let event;
    try {
      event = await this.paymentGateway.parsePaymentWebhook({
        payload,
        signature,
      });
    } catch (error) {
      if (error instanceof InvalidPaymentWebhookSignatureError) {
        throw new BadRequestException('Invalid Stripe webhook signature');
      }
      throw error;
    }
    if (event.type === 'ignored') return;

    const billing = await this.billingRepository.findByGatewayTransactionId(
      event.gatewayTransactionId,
    );
    if (!billing) throw new NotFoundException('Billing not found');

    await this.billingRepository.recordCheckoutSessionPayment(
      event.gatewayTransactionId,
      event.method,
      event.paidAt,
    );

    const expectedUpdatedAt = new Date(billing.getUpdatedAt());
    const changed = billing.registerPayment(
      {
        gatewayTransactionId: event.gatewayTransactionId,
        method: event.method,
        paidAt: event.paidAt,
      },
      true,
    );
    if (!changed) return;

    const updated = await this.billingRepository.update(
      billing,
      expectedUpdatedAt,
    );
    if (updated) return;

    const stored = await this.billingRepository.findByGatewayTransactionId(
      event.gatewayTransactionId,
    );
    if (stored?.getStatus() === BillingStatus.PAID) {
      return;
    }

    throw new ConflictException('Billing was changed by another request');
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
      idempotencyKey: this.createPaymentLinkIdempotencyKey(billing.getId()),
    });
    await this.billingRepository.registerCheckoutSession(
      billing.getId(),
      link.gatewayTransactionId,
    );
    const expectedUpdatedAt = new Date(billing.getUpdatedAt());
    billing.generatePaymentLink(link);
    const persisted = await this.persistUpdatedBilling(
      billing,
      expectedUpdatedAt,
    );
    void this.enqueuePaymentLinkReadyNotification(persisted);

    return persisted;
  }

  private createPaymentLinkIdempotencyKey(billingId: string): string {
    return `billing-payment-link:${billingId}:${randomUUID()}`;
  }
}

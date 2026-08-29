import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUniqueViolation } from '../../../shared/database/prisma-errors';
import { paymentLinkReadyEmail } from '../../../shared/notifications/email/notification-templates';
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
        'A ordem de serviço precisa estar finalizada para gerar cobrança',
      );
    }

    const existing =
      await this.billingRepository.findByServiceOrderId(serviceOrderId);

    if (existing) {
      if (existing.getStatus() === BillingStatus.PENDING) {
        return this.createAndPersistPaymentLink(existing);
      }
      throw new ConflictException(
        'Já existe cobrança para esta ordem de serviço',
      );
    }

    const budgets =
      await this.budgetService.findByServiceOrderId(serviceOrderId);
    const acceptedBudget = budgets
      .filter((budget) => budget.getStatus() === BudgetStatus.ACCEPTED)
      .sort((a, b) => b.getVersion() - a.getVersion())[0];

    if (!acceptedBudget) {
      throw new ConflictException(
        'É preciso um orçamento aceito para gerar a cobrança',
      );
    }

    const billing = Billing.create({
      serviceOrderId,
      budgetId: acceptedBudget.getId(),
      // Regra 14: o valor da cobrança é o total do orçamento aceito. Os dois
      // lados falam Money, então não há ida e volta por decimal no meio.
      amount: acceptedBudget.getTotal(),
    });

    try {
      const created = await this.billingRepository.create(billing);
      return await this.createAndPersistPaymentLink(created);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Já existe cobrança para esta ordem de serviço',
        );
      }

      throw error;
    }
  }

  async findById(id: string): Promise<Billing> {
    const billing = await this.billingRepository.findById(id);

    if (!billing) {
      throw new NotFoundException('Cobrança não encontrada');
    }

    return billing;
  }

  async findByServiceOrderId(serviceOrderId: string): Promise<Billing> {
    const billing = await this.billingRepository.findByServiceOrderId(
      serviceOrderId.trim(),
    );

    if (!billing) {
      throw new NotFoundException('Cobrança não encontrada');
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

      await this.notifications.enqueue({
        type: NotificationType.PAYMENT_LINK_READY,
        to: client.getEmail().getValue(),
        ...paymentLinkReadyEmail({
          serviceOrderId: billing.getServiceOrderId(),
          total: billing.getAmount().value,
          paymentLink,
        }),
      });
    } catch {
      // A cobrança e o link já foram persistidos; falhas de notificação não
      // podem alterar esse resultado de negócio.
    }
  }

  async renewPaymentLink(id: string, now = new Date()): Promise<Billing> {
    const billing = await this.findById(id);
    if (billing.getStatus() === BillingStatus.PAID) {
      throw new ConflictException('Cobrança paga é terminal');
    }

    const penalty = billing.calculatePenalty(now);
    if (!penalty) {
      throw new BadRequestException(
        'O link de pagamento da cobrança ainda não expirou',
      );
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
        throw new BadRequestException(
          'Assinatura do webhook do Stripe inválida',
        );
      }
      throw error;
    }
    if (event.type === 'ignored') return;

    const billing = await this.billingRepository.findByGatewayTransactionId(
      event.gatewayTransactionId,
    );
    if (!billing) throw new NotFoundException('Cobrança não encontrada');

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

    throw new ConflictException('A cobrança foi alterada por outra requisição');
  }

  async deliverServiceOrder(id: string): Promise<void> {
    const billing = await this.findById(id);

    if (billing.getStatus() !== BillingStatus.PAID) {
      throw new ConflictException(
        'A cobrança precisa estar paga para entregar a OS',
      );
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
      throw new ConflictException(
        'A cobrança foi alterada por outra requisição',
      );
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

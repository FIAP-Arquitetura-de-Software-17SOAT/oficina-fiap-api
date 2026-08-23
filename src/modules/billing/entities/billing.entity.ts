import { randomUUID } from 'crypto';
import { DomainException } from '../../../shared/domain/domain.exception';
import { Money } from '../../../shared/domain/value-objects/money.vo';
import { BillingStatus } from '../enums/billing-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';

export interface BillingProps {
  serviceOrderId: string;
  budgetId: string;
  amount: Money;
  status?: BillingStatus;
  paymentLink?: string | null;
  gatewayTransactionId?: string | null;
  paymentMethod?: PaymentMethod | null;
  generatedAt?: Date;
  paidAt?: Date | null;
  expiresAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface GeneratePaymentLinkProps {
  paymentLink: string;
  gatewayTransactionId: string;
  expiresAt?: Date | null;
}

export interface RegisterPaymentProps {
  gatewayTransactionId: string;
  method: PaymentMethod;
  paidAt?: Date;
}

export class Billing {
  private readonly id: string;
  private readonly serviceOrderId: string;
  private readonly budgetId: string;
  private readonly amount: Money;
  private status: BillingStatus;
  private paymentLink: string | null;
  private gatewayTransactionId: string | null;
  private paymentMethod: PaymentMethod | null;
  private readonly generatedAt: Date;
  private paidAt: Date | null;
  private expiresAt: Date | null;
  private readonly createdAt: Date;
  private updatedAt: Date;

  private constructor(id: string, props: BillingProps) {
    this.id = id;
    this.serviceOrderId = this.validateRequiredId(
      props.serviceOrderId,
      'Service order is required',
    );
    this.budgetId = this.validateRequiredId(
      props.budgetId,
      'Budget is required',
    );
    if (props.amount.valueInCents <= 0) {
      throw new DomainException('Billing amount must be greater than zero');
    }
    this.amount = props.amount;
    this.status = props.status ?? BillingStatus.PENDING;
    this.paymentLink = props.paymentLink ?? null;
    this.gatewayTransactionId = props.gatewayTransactionId ?? null;
    this.paymentMethod = props.paymentMethod ?? null;
    this.generatedAt = props.generatedAt ?? new Date();
    this.paidAt = props.paidAt ?? null;
    this.expiresAt = props.expiresAt ?? null;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
  }

  static create(props: BillingProps): Billing {
    return new Billing(randomUUID(), props);
  }

  static restore(id: string, props: BillingProps): Billing {
    return new Billing(id, props);
  }

  generatePaymentLink(props: GeneratePaymentLinkProps): void {
    if (this.status !== BillingStatus.PENDING) {
      throw new DomainException(
        'Payment link can only be generated for pending billing',
      );
    }
    this.paymentLink = this.validatePaymentLink(props.paymentLink);
    this.gatewayTransactionId = this.validateRequiredId(
      props.gatewayTransactionId,
      'Gateway transaction is required',
    );
    this.expiresAt = props.expiresAt ?? null;
    this.status = BillingStatus.WAITING_PAYMENT;
    this.touch();
  }

  registerPayment(props: RegisterPaymentProps): boolean {
    const gatewayTransactionId = this.validateRequiredId(
      props.gatewayTransactionId,
      'Gateway transaction is required',
    );
    if (this.status === BillingStatus.PAID) {
      if (this.gatewayTransactionId === gatewayTransactionId) return false;
      throw new DomainException('Paid billing is terminal');
    }
    if (this.status !== BillingStatus.WAITING_PAYMENT) {
      throw new DomainException(
        'Payment can only be registered while waiting payment',
      );
    }
    if (this.gatewayTransactionId !== gatewayTransactionId) {
      throw new DomainException('Gateway transaction does not match billing');
    }
    this.paymentMethod = props.method;
    this.paidAt = props.paidAt ?? new Date();
    this.status = BillingStatus.PAID;
    this.touch();
    return true;
  }

  expire(now = new Date()): void {
    if (this.status === BillingStatus.PAID) {
      throw new DomainException('Paid billing is terminal');
    }
    if (this.status === BillingStatus.EXPIRED) return;
    if (this.expiresAt && now.getTime() < this.expiresAt.getTime()) {
      throw new DomainException('Billing payment link has not expired yet');
    }
    this.status = BillingStatus.EXPIRED;
    this.touch();
  }

  getId(): string {
    return this.id;
  }
  getServiceOrderId(): string {
    return this.serviceOrderId;
  }
  getBudgetId(): string {
    return this.budgetId;
  }
  getAmount(): Money {
    return this.amount;
  }
  getStatus(): BillingStatus {
    return this.status;
  }
  getPaymentLink(): string | null {
    return this.paymentLink;
  }
  getGatewayTransactionId(): string | null {
    return this.gatewayTransactionId;
  }
  getPaymentMethod(): PaymentMethod | null {
    return this.paymentMethod;
  }
  getGeneratedAt(): Date {
    return this.generatedAt;
  }
  getPaidAt(): Date | null {
    return this.paidAt;
  }
  getExpiresAt(): Date | null {
    return this.expiresAt;
  }
  getCreatedAt(): Date {
    return this.createdAt;
  }
  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  private validateRequiredId(value: string, message: string): string {
    const trimmed = (value ?? '').trim();
    if (!trimmed) throw new DomainException(message);
    return trimmed;
  }

  private validatePaymentLink(value: string): string {
    const trimmed = (value ?? '').trim();
    if (!trimmed) throw new DomainException('Payment link is required');
    return trimmed;
  }

  private touch(): void {
    const now = new Date();
    this.updatedAt =
      now.getTime() > this.updatedAt.getTime()
        ? now
        : new Date(this.updatedAt.getTime() + 1);
  }
}

import { randomUUID } from 'crypto';
import { DomainException } from '../../../shared/domain/domain.exception';
import { BillingStatus } from '../enums/billing-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentAmount } from '../value-objects/payment-amount.vo';
import { Payment } from './payment.entity';

export interface RestorePaymentProps {
  id: string;
  amountInCents: number;
  method: PaymentMethod;
  paidAt: Date;
  createdAt: Date;
}

export interface BillingProps {
  serviceOrderId: string;
  totalAmountInCents: number;
  status?: BillingStatus;
  payments?: RestorePaymentProps[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface RegisterPaymentProps {
  amount: PaymentAmount;
  method: PaymentMethod;
  paidAt?: Date;
}

export class Billing {
  private readonly id: string;
  private readonly serviceOrderId: string;
  private readonly totalAmountInCents: number;
  private status: BillingStatus;
  private readonly payments: Payment[];
  private readonly createdAt: Date;
  private updatedAt: Date;

  private constructor(id: string, props: BillingProps) {
    this.id = id;
    this.serviceOrderId = this.validateServiceOrderId(props.serviceOrderId);
    this.totalAmountInCents = this.validateTotal(props.totalAmountInCents);
    this.status = props.status ?? BillingStatus.OPEN;
    this.payments = (props.payments ?? []).map((payment) =>
      Payment.restore(payment.id, {
        amount: PaymentAmount.fromCents(payment.amountInCents),
        method: payment.method,
        paidAt: payment.paidAt,
        createdAt: payment.createdAt,
      }),
    );
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();

    this.assertPaidAmountDoesNotExceedTotal();
    this.refreshStatus();
  }

  static create(props: BillingProps): Billing {
    return new Billing(randomUUID(), props);
  }

  static restore(id: string, props: BillingProps): Billing {
    return new Billing(id, props);
  }

  registerPayment(props: RegisterPaymentProps): Payment {
    if (this.status === BillingStatus.CANCELLED) {
      throw new DomainException('Cancelled billing cannot receive payments');
    }

    if (props.amount.valueInCents > this.getBalanceAmountInCents()) {
      throw new DomainException('Payment amount exceeds billing balance');
    }

    const payment = Payment.create({
      amount: props.amount,
      method: props.method,
      paidAt: props.paidAt,
    });

    this.payments.push(payment);
    this.refreshStatus();
    this.touch();

    return payment;
  }

  cancel(): void {
    if (this.status === BillingStatus.PAID) {
      throw new DomainException('Paid billing cannot be cancelled');
    }

    this.status = BillingStatus.CANCELLED;
    this.touch();
  }

  getId(): string {
    return this.id;
  }

  getServiceOrderId(): string {
    return this.serviceOrderId;
  }

  getTotalAmountInCents(): number {
    return this.totalAmountInCents;
  }

  getPaidAmountInCents(): number {
    return this.payments.reduce(
      (total, payment) => total + payment.getAmount().valueInCents,
      0,
    );
  }

  getBalanceAmountInCents(): number {
    return this.totalAmountInCents - this.getPaidAmountInCents();
  }

  getStatus(): BillingStatus {
    return this.status;
  }

  getPayments(): Payment[] {
    return [...this.payments];
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  private validateServiceOrderId(serviceOrderId: string): string {
    const trimmed = (serviceOrderId ?? '').trim();
    if (!trimmed) throw new DomainException('Service order is required');
    return trimmed;
  }

  private validateTotal(totalAmountInCents: number): number {
    if (!Number.isInteger(totalAmountInCents) || totalAmountInCents <= 0) {
      throw new DomainException('Billing total must be greater than zero');
    }
    return totalAmountInCents;
  }

  private assertPaidAmountDoesNotExceedTotal(): void {
    if (this.getPaidAmountInCents() > this.totalAmountInCents) {
      throw new DomainException('Payment amount exceeds billing balance');
    }
  }

  private refreshStatus(): void {
    if (this.status === BillingStatus.CANCELLED) return;

    const paidAmount = this.getPaidAmountInCents();
    if (paidAmount === 0) {
      this.status = BillingStatus.OPEN;
      return;
    }

    this.status =
      paidAmount === this.totalAmountInCents
        ? BillingStatus.PAID
        : BillingStatus.PARTIALLY_PAID;
  }

  private touch(): void {
    const now = new Date();
    this.updatedAt =
      now.getTime() > this.updatedAt.getTime()
        ? now
        : new Date(this.updatedAt.getTime() + 1);
  }
}

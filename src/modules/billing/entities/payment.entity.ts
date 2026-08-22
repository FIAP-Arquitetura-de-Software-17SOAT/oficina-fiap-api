import { randomUUID } from 'crypto';
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentAmount } from '../value-objects/payment-amount.vo';

export interface CreatePaymentProps {
  amount: PaymentAmount;
  method: PaymentMethod;
  paidAt?: Date;
  createdAt?: Date;
}

export class Payment {
  private readonly id: string;
  private readonly amount: PaymentAmount;
  private readonly method: PaymentMethod;
  private readonly paidAt: Date;
  private readonly createdAt: Date;

  private constructor(id: string, props: CreatePaymentProps) {
    this.id = id;
    this.amount = props.amount;
    this.method = props.method;
    this.paidAt = props.paidAt ?? new Date();
    this.createdAt = props.createdAt ?? new Date();
  }

  static create(props: CreatePaymentProps): Payment {
    return new Payment(randomUUID(), props);
  }

  static restore(id: string, props: CreatePaymentProps): Payment {
    return new Payment(id, props);
  }

  getId(): string {
    return this.id;
  }

  getAmount(): PaymentAmount {
    return this.amount;
  }

  getMethod(): PaymentMethod {
    return this.method;
  }

  getPaidAt(): Date {
    return this.paidAt;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }
}

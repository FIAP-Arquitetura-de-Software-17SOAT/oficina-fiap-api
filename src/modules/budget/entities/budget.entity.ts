import { randomUUID } from 'crypto';
import { DomainException } from '../../../shared/domain/domain.exception';

export enum BudgetStatus {
  GENERATED = 'GENERATED',
  WAITING_APPROVAL = 'WAITING_APPROVAL',
  ACCEPTED = 'ACCEPTED',
  REFUSED = 'REFUSED',
}

export enum BudgetItemType {
  SERVICE = 'SERVICE',
  PART = 'PART',
}

export interface BudgetItemProps {
  id?: string;
  description: string;
  type: BudgetItemType;
  quantity: number;
  unitPrice: number;
}

export interface CreateBudgetProps {
  serviceOrderId: string;
  version: number;
  items: BudgetItemProps[];
}

export interface BudgetProps extends CreateBudgetProps {
  status: BudgetStatus;
  refusalReason?: string | null;
  sentAt?: Date | null;
  answeredAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class BudgetItem {
  private readonly id: string;
  private readonly description: string;
  private readonly type: BudgetItemType;
  private readonly quantity: number;
  private readonly unitPrice: number;

  constructor(props: BudgetItemProps) {
    this.id = props.id ?? randomUUID();
    this.description = this.validateDescription(props.description);
    this.type = props.type;
    this.quantity = this.validatePositiveNumber(props.quantity, 'Quantity');
    this.unitPrice = this.validatePositiveNumber(props.unitPrice, 'Unit price');
  }

  getId(): string {
    return this.id;
  }

  getDescription(): string {
    return this.description;
  }

  getType(): BudgetItemType {
    return this.type;
  }

  getQuantity(): number {
    return this.quantity;
  }

  getUnitPrice(): number {
    return this.unitPrice;
  }

  getSubtotal(): number {
    return this.quantity * this.unitPrice;
  }

  private validateDescription(description: string): string {
    const trimmed = (description ?? '').trim();
    if (!trimmed) throw new DomainException('Item description is required');
    return trimmed;
  }

  private validatePositiveNumber(value: number, field: string): number {
    if (!Number.isFinite(value) || value <= 0) {
      throw new DomainException(`${field} must be greater than zero`);
    }
    return value;
  }
}

export class Budget {
  private readonly id: string;
  // TODO: Replace this string with the real ServiceOrder/Service integration.
  private readonly serviceOrderId: string;
  private readonly version: number;
  private readonly items: BudgetItem[];
  private status: BudgetStatus;
  private refusalReason: string | null;
  private sentAt: Date | null;
  private answeredAt: Date | null;
  private readonly createdAt: Date;
  private updatedAt: Date;

  private constructor(id: string, props: BudgetProps) {
    this.id = id;
    this.serviceOrderId = this.validateServiceOrderId(props.serviceOrderId);
    this.version = this.validateVersion(props.version);
    this.items = this.validateItems(props.items);
    this.status = props.status;
    this.refusalReason = props.refusalReason ?? null;
    this.sentAt = props.sentAt ?? null;
    this.answeredAt = props.answeredAt ?? null;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
  }

  static create(props: CreateBudgetProps): Budget {
    return new Budget(randomUUID(), {
      ...props,
      status: BudgetStatus.GENERATED,
    });
  }

  static restore(id: string, props: BudgetProps): Budget {
    return new Budget(id, props);
  }

  addItem(item: BudgetItemProps): void {
    this.assertGenerated();
    this.items.push(new BudgetItem(item));
    this.touch();
  }

  removeItem(itemId: string): void {
    this.assertGenerated();

    if (this.items.length === 1) {
      throw new DomainException('Budget must have at least one item');
    }

    const itemIndex = this.items.findIndex((item) => item.getId() === itemId);

    if (itemIndex === -1) {
      throw new DomainException('Budget item not found');
    }

    this.items.splice(itemIndex, 1);
    this.touch();
  }

  sendToCustomer(): void {
    this.assertGenerated();
    this.status = BudgetStatus.WAITING_APPROVAL;
    this.sentAt = new Date();
    this.touch();
  }

  accept(): void {
    this.assertWaitingApproval();
    this.status = BudgetStatus.ACCEPTED;
    this.refusalReason = null;
    this.answeredAt = new Date();
    this.touch();
  }

  refuse(reason: string): void {
    this.assertWaitingApproval();
    const trimmed = (reason ?? '').trim();
    if (!trimmed) throw new DomainException('Refusal reason is required');
    this.status = BudgetStatus.REFUSED;
    this.refusalReason = trimmed;
    this.answeredAt = new Date();
    this.touch();
  }

  getId(): string {
    return this.id;
  }

  getServiceOrderId(): string {
    return this.serviceOrderId;
  }

  getVersion(): number {
    return this.version;
  }

  getItems(): BudgetItem[] {
    return [...this.items];
  }

  getStatus(): BudgetStatus {
    return this.status;
  }

  getTotalAmount(): number {
    return this.items.reduce((total, item) => total + item.getSubtotal(), 0);
  }

  getRefusalReason(): string | null {
    return this.refusalReason;
  }

  getSentAt(): Date | null {
    return this.sentAt;
  }

  getAnsweredAt(): Date | null {
    return this.answeredAt;
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

  private validateVersion(version: number): number {
    if (!Number.isInteger(version) || version <= 0) {
      throw new DomainException('Version must be an integer greater than zero');
    }
    return version;
  }

  private validateItems(items: BudgetItemProps[]): BudgetItem[] {
    if (!items?.length) {
      throw new DomainException('Budget must have at least one item');
    }
    return items.map((item) => new BudgetItem(item));
  }

  private assertWaitingApproval(): void {
    if (this.status !== BudgetStatus.WAITING_APPROVAL) {
      throw new DomainException(
        'Only budgets waiting for approval can be answered',
      );
    }
  }

  private assertGenerated(): void {
    if (this.status !== BudgetStatus.GENERATED) {
      throw new DomainException('Only generated budgets can be changed');
    }
  }

  private touch(): void {
    this.updatedAt = new Date();
  }
}

import { randomUUID } from 'crypto';
import { DomainException } from '../../../shared/domain/domain.exception';

const MAX_DECIMAL_AMOUNT = 99_999_999.99;
const MAX_CENTS = 9_999_999_999;

export enum BudgetStatus {
  GENERATED = 'GENERATED',
  WAITING_APPROVAL = 'WAITING_APPROVAL',
  ACCEPTED = 'ACCEPTED',
  BUDGET_REFUSED = 'BUDGET_REFUSED',
}

export enum BudgetItemType {
  SERVICE = 'SERVICE',
  PART = 'PART',
}

export interface BudgetItemProps {
  id?: string;
  // `referenciaId` do modelo de dominio: a peca que o item representa. Nulo em
  // itens de servico, que nao saem do estoque.
  partId?: string | null;
  // O par do partId para itens de servico: aponta para o servico do catalogo.
  // Descricao e preco continuam sendo copia — reajuste no catalogo nao muda
  // orcamento ja acordado.
  serviceId?: string | null;
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
  private readonly partId: string | null;
  private readonly serviceId: string | null;
  private readonly description: string;
  private readonly type: BudgetItemType;
  private readonly quantity: number;
  private readonly unitPrice: number;

  constructor(props: BudgetItemProps) {
    this.id = props.id ?? randomUUID();
    this.partId = this.validatePartId(props.partId, props.type);
    this.serviceId = this.validateServiceId(props.serviceId, props.type);
    this.description = this.validateDescription(props.description);
    this.type = props.type;
    this.quantity = this.validateDecimalAmount(props.quantity, 'Quantity');
    this.unitPrice = this.validateDecimalAmount(props.unitPrice, 'Unit price');
    this.assertSubtotalFits();
  }

  getId(): string {
    return this.id;
  }

  getPartId(): string | null {
    return this.partId;
  }

  getServiceId(): string | null {
    return this.serviceId;
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
    return this.getSubtotalInCents() / 100;
  }

  getSubtotalInCents(): number {
    return Math.round(
      (this.toCents(this.quantity) * this.toCents(this.unitPrice)) / 100,
    );
  }

  private validatePartId(
    partId: string | null | undefined,
    type: BudgetItemType,
  ): string | null {
    const trimmed = (partId ?? '').trim();

    if (!trimmed) return null;

    if (type !== BudgetItemType.PART) {
      throw new DomainException('Only part items can reference a part');
    }

    return trimmed;
  }

  private validateServiceId(
    serviceId: string | null | undefined,
    type: BudgetItemType,
  ): string | null {
    const trimmed = (serviceId ?? '').trim();

    if (!trimmed) return null;

    if (type !== BudgetItemType.SERVICE) {
      throw new DomainException('Only service items can reference a service');
    }

    return trimmed;
  }

  private validateDescription(description: string): string {
    const trimmed = (description ?? '').trim();
    if (!trimmed) throw new DomainException('Item description is required');
    return trimmed;
  }

  private validateDecimalAmount(value: number, field: string): number {
    const cents = this.toCents(value);

    if (
      !Number.isFinite(value) ||
      value <= 0 ||
      !Number.isSafeInteger(cents) ||
      Math.abs(value * 100 - cents) > 0.000001 ||
      value > MAX_DECIMAL_AMOUNT
    ) {
      throw new DomainException(`${field} must be greater than zero`);
    }
    return value;
  }

  private assertSubtotalFits(): void {
    const quantityCents = this.toCents(this.quantity);
    const unitPriceCents = this.toCents(this.unitPrice);

    if (quantityCents > (MAX_CENTS * 100) / unitPriceCents) {
      throw new DomainException('Item subtotal exceeds supported range');
    }
  }

  private toCents(value: number): number {
    return Math.round(value * 100);
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
    const budgetItem = new BudgetItem(item);
    this.assertTotalFits([...this.items, budgetItem]);
    this.items.push(budgetItem);
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
    this.status = BudgetStatus.BUDGET_REFUSED;
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
    return this.getTotalInCents() / 100;
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
    const budgetItems = items.map((item) => new BudgetItem(item));
    this.assertTotalFits(budgetItems);
    return budgetItems;
  }

  private assertTotalFits(items: BudgetItem[]): void {
    if (
      items.reduce((total, item) => total + item.getSubtotalInCents(), 0) >
      MAX_CENTS
    ) {
      throw new DomainException('Budget total exceeds supported range');
    }
  }

  private getTotalInCents(): number {
    return this.items.reduce(
      (total, item) => total + item.getSubtotalInCents(),
      0,
    );
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
    const now = new Date();
    this.updatedAt =
      now.getTime() > this.updatedAt.getTime()
        ? now
        : new Date(this.updatedAt.getTime() + 1);
  }
}

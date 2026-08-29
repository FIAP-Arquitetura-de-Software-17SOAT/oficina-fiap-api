import { randomUUID } from 'crypto';
import { DomainException } from '../../../shared/domain/domain.exception';
import { Money } from '../../../shared/domain/value-objects/money.vo';
import { BudgetItemType } from '../enums/budget-item-type.enum';
import { BudgetStatus } from '../enums/budget-status.enum';

export { BudgetItemType, BudgetStatus };

/** Teto que o schema suporta: `totalCents Int` no Postgres. */
const MAX_CENTS = 9_999_999_999;
const MAX_QUANTITY = 99_999_999.99;

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
  /** Cópia do preço no momento da proposta: reajuste depois não muda o acordo. */
  unitPrice: Money;
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
  private readonly unitPrice: Money;

  constructor(props: BudgetItemProps) {
    this.id = props.id ?? randomUUID();
    this.partId = this.validatePartId(props.partId, props.type);
    this.serviceId = this.validateServiceId(props.serviceId, props.type);
    this.description = this.validateDescription(props.description);
    this.type = props.type;
    this.quantity = this.validateQuantity(props.quantity);
    this.unitPrice = this.validateUnitPrice(props.unitPrice);
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

  getUnitPrice(): Money {
    return this.unitPrice;
  }

  getSubtotal(): Money {
    return this.unitPrice.multiply(this.quantity);
  }

  private validatePartId(
    partId: string | null | undefined,
    type: BudgetItemType,
  ): string | null {
    const trimmed = (partId ?? '').trim();

    if (!trimmed) return null;

    if (type !== BudgetItemType.PART) {
      throw new DomainException(
        'Somente item de peça pode referenciar uma peça',
      );
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
      throw new DomainException(
        'Somente item de serviço pode referenciar um serviço do catálogo',
      );
    }

    return trimmed;
  }

  private validateDescription(description: string): string {
    const trimmed = (description ?? '').trim();
    if (!trimmed) {
      throw new DomainException('Descrição do item é obrigatória');
    }
    return trimmed;
  }

  /**
   * Quantidade decimal com no máximo duas casas, que é o que a coluna
   * `Decimal(10, 2)` guarda. Sem o corte de casas, 1,005 seria aceito aqui e
   * voltaria do banco como 1,00 — o subtotal mudaria sozinho entre gravar e ler.
   */
  private validateQuantity(quantity: number): number {
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      quantity > MAX_QUANTITY ||
      Math.abs(quantity * 100 - Math.round(quantity * 100)) > 0.000001
    ) {
      throw new DomainException(
        'Quantidade do item deve ser maior que zero e ter no máximo duas casas decimais',
      );
    }

    return quantity;
  }

  private validateUnitPrice(unitPrice: Money): Money {
    // Money já barra negativo. Item de graça dentro de um orçamento é erro de
    // digitação, não desconto: desconto seria um item próprio.
    if (unitPrice.valueInCents === 0) {
      throw new DomainException(
        'Preço unitário do item deve ser maior que zero',
      );
    }

    return unitPrice;
  }

  private assertSubtotalFits(): void {
    if (this.getSubtotal().valueInCents > MAX_CENTS) {
      throw new DomainException('Subtotal do item excede o limite suportado');
    }
  }
}

export class Budget {
  private readonly id: string;
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
      throw new DomainException('Orçamento deve ter ao menos um item');
    }

    const itemIndex = this.items.findIndex((item) => item.getId() === itemId);

    if (itemIndex === -1) {
      throw new DomainException('Item não encontrado no orçamento');
    }

    this.items.splice(itemIndex, 1);
    this.touch();
  }

  /** Comando "Enviar orçamento ao cliente" (§6.2). */
  sendToClient(): void {
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

  /** Total calculado pelo sistema (regra 5). */
  getTotal(): Money {
    return this.items.reduce(
      (total, item) => total.add(item.getSubtotal()),
      Money.fromCents(0),
    );
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
    if (!trimmed) {
      throw new DomainException('Ordem de serviço do orçamento é obrigatória');
    }
    return trimmed;
  }

  private validateVersion(version: number): number {
    if (!Number.isInteger(version) || version <= 0) {
      throw new DomainException(
        'Versão do orçamento deve ser um inteiro maior que zero',
      );
    }
    return version;
  }

  private validateItems(items: BudgetItemProps[]): BudgetItem[] {
    if (!items?.length) {
      throw new DomainException('Orçamento deve ter ao menos um item');
    }
    const budgetItems = items.map((item) => new BudgetItem(item));
    this.assertTotalFits(budgetItems);
    return budgetItems;
  }

  private assertTotalFits(items: BudgetItem[]): void {
    const total = items.reduce(
      (accumulated, item) => accumulated.add(item.getSubtotal()),
      Money.fromCents(0),
    );

    if (total.valueInCents > MAX_CENTS) {
      throw new DomainException('Total do orçamento excede o limite suportado');
    }
  }

  private assertWaitingApproval(): void {
    if (this.status !== BudgetStatus.WAITING_APPROVAL) {
      throw new DomainException(
        'Somente orçamento aguardando aprovação pode ser respondido',
      );
    }
  }

  private assertGenerated(): void {
    if (this.status !== BudgetStatus.GENERATED) {
      throw new DomainException(
        'Somente orçamento em GERADO pode ser alterado',
      );
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

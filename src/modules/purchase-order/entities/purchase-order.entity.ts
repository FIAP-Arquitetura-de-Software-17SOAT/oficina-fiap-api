import { randomUUID } from 'crypto';

import { PurchaseOrderItem } from './purchase-order-item.entity';

import { PurchaseOrderStatus } from '../enums/purchase-order-status.enum';

import { PurchaseOrderNumber } from '../value-objects/purchase-order-number.vo';

import { Money } from '../../../shared/domain/value-objects/money.vo';

import { DomainException } from '../../../shared/domain/domain.exception';

export interface PurchaseOrderProps {
  id?: string;

  number: PurchaseOrderNumber;
  supplier: string;

  status?: PurchaseOrderStatus;

  items?: PurchaseOrderItem[];

  createdAt?: Date;
  updatedAt?: Date;
  deliveredAt?: Date;
}

export class PurchaseOrder {
  private readonly id: string;

  private readonly number: PurchaseOrderNumber;

  private readonly supplier: string;

  private status: PurchaseOrderStatus;

  private readonly items: PurchaseOrderItem[];

  private readonly createdAt: Date;

  private updatedAt: Date;

  private deliveredAt?: Date;

  constructor(props: PurchaseOrderProps) {
    if (!props.supplier?.trim()) {
      throw new DomainException('O fornecedor deve ser informado');
    }

    this.id = props.id ?? randomUUID();

    this.number = props.number;

    this.supplier = props.supplier.trim();

    this.status = props.status ?? PurchaseOrderStatus.NEEDS_PURCHASE;

    this.items = props.items ?? [];

    this.createdAt = props.createdAt ?? new Date();

    this.updatedAt = props.updatedAt ?? new Date();

    this.deliveredAt = props.deliveredAt;
  }

  addItem(item: PurchaseOrderItem): void {
    this.ensureEditable();

    this.items.push(item);

    this.touch();
  }

  removeItem(itemId: string): void {
    this.ensureEditable();

    const index = this.items.findIndex((item) => item.getId() === itemId);

    if (index === -1) {
      throw new DomainException('Item não encontrado no pedido');
    }

    this.items.splice(index, 1);

    this.touch();
  }

  registerPurchase(): void {
    if (this.status !== PurchaseOrderStatus.NEEDS_PURCHASE) {
      throw new DomainException(
        'Somente pedidos em NEEDS_PURCHASE podem registrar a compra',
      );
    }

    if (this.items.length === 0) {
      throw new DomainException(
        'Não é possível registrar uma compra sem itens',
      );
    }

    this.status = PurchaseOrderStatus.AWAITING_DELIVERY;

    this.touch();
  }

  markAsDelivered(): void {
    if (this.status !== PurchaseOrderStatus.AWAITING_DELIVERY) {
      throw new DomainException(
        'Somente pedidos aguardando entrega podem ser marcados como entregues',
      );
    }

    this.status = PurchaseOrderStatus.DELIVERED;

    this.deliveredAt = new Date();

    this.touch();
  }

  getTotal(): Money {
    return this.items.reduce(
      (total, item) => total.add(item.getSubtotal()),
      Money.fromCents(0),
    );
  }

  private ensureEditable(): void {
    if (this.status !== PurchaseOrderStatus.NEEDS_PURCHASE) {
      throw new DomainException(
        'Não é possível alterar os itens após o registro da compra',
      );
    }
  }

  private touch(): void {
    this.updatedAt = new Date();
  }

  getId(): string {
    return this.id;
  }

  getNumber(): PurchaseOrderNumber {
    return this.number;
  }

  getSupplier(): string {
    return this.supplier;
  }

  getStatus(): PurchaseOrderStatus {
    return this.status;
  }

  getItems(): readonly PurchaseOrderItem[] {
    return this.items;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  getDeliveredAt(): Date | undefined {
    return this.deliveredAt;
  }
}

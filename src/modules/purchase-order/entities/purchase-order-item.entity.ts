import { randomUUID } from 'crypto';

import { Money } from '../../../shared/domain/value-objects/money.vo';
import { Quantity } from '../../../shared/domain/value-objects/quantity.vo';
import { DomainException } from '../../../shared/domain/domain.exception';

export interface PurchaseOrderItemProps {
  id?: string;
  partId: string;
  quantity: Quantity;
  unitPrice: Money;
}

export class PurchaseOrderItem {
  private readonly id: string;
  private readonly partId: string;
  private readonly quantity: Quantity;
  private readonly unitPrice: Money;

  constructor(props: PurchaseOrderItemProps) {
    if (!props.partId?.trim()) {
      throw new DomainException('A peça deve ser informada');
    }

    this.id = props.id ?? randomUUID();

    this.partId = props.partId.trim();

    this.quantity = props.quantity;

    this.unitPrice = props.unitPrice;
  }

  getSubtotal(): Money {
    return this.unitPrice.multiply(this.quantity.getValue());
  }

  getId(): string {
    return this.id;
  }

  getPartId(): string {
    return this.partId;
  }

  getQuantity(): Quantity {
    return this.quantity;
  }

  getUnitPrice(): Money {
    return this.unitPrice;
  }
}

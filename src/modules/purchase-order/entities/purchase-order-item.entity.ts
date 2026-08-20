import { randomUUID } from 'crypto';

import { Money } from '../value-objects/money.vo';
import { Quantity } from '../value-objects/quantity.vo';
import { DomainException } from '../../../shared/domain/domain.exception';

export interface PurchaseOrderItemProps {
  id?: string;
  pecaId: string;
  quantity: Quantity;
  unitPrice: Money;
}

export class PurchaseOrderItem {
  private readonly id: string;
  private readonly pecaId: string;
  private readonly quantity: Quantity;
  private readonly unitPrice: Money;

  constructor(
    props: PurchaseOrderItemProps,
  ) {
    if (!props.pecaId?.trim()) {
      throw new DomainException(
        'A peça deve ser informada',
      );
    }

    this.id =
      props.id ?? randomUUID();

    this.pecaId =
      props.pecaId.trim();

    this.quantity =
      props.quantity;

    this.unitPrice =
      props.unitPrice;
  }

  getSubtotal(): Money {
    return this.unitPrice.multiply(
      this.quantity.value,
    );
  }

  getId(): string {
    return this.id;
  }

  getPecaId(): string {
    return this.pecaId;
  }

  getQuantity(): Quantity {
    return this.quantity;
  }

  getUnitPrice(): Money {
    return this.unitPrice;
  }
}
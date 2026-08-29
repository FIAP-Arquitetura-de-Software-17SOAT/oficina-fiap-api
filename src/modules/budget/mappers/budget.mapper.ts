import {
  Budget,
  BudgetItemType,
  BudgetStatus,
} from '../entities/budget.entity';
import { BudgetResponseDto } from '../dto/budget.dto';
import { Money } from '../../../shared/domain/value-objects/money.vo';

type BudgetWithItems = {
  id: string;
  serviceOrderId: string;
  version: number;
  status: BudgetStatus;
  refusalReason: string | null;
  sentAt: Date | null;
  answeredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    partId: string | null;
    serviceId: string | null;
    description: string;
    type: BudgetItemType;
    quantity: unknown;
    unitPriceCents: number;
  }>;
};

export class BudgetMapper {
  static toResponse(budget: Budget): BudgetResponseDto {
    return {
      id: budget.getId(),
      serviceOrderId: budget.getServiceOrderId(),
      version: budget.getVersion(),
      status: budget.getStatus(),
      totalAmount: budget.getTotal().value,
      refusalReason: budget.getRefusalReason(),
      sentAt: budget.getSentAt(),
      answeredAt: budget.getAnsweredAt(),
      createdAt: budget.getCreatedAt(),
      updatedAt: budget.getUpdatedAt(),
      items: budget.getItems().map((item) => ({
        id: item.getId(),
        partId: item.getPartId(),
        serviceId: item.getServiceId(),
        description: item.getDescription(),
        type: item.getType(),
        quantity: item.getQuantity(),
        unitPrice: item.getUnitPrice().value,
        subtotal: item.getSubtotal().value,
      })),
    };
  }

  static toResponseList(budgets: Budget[]): BudgetResponseDto[] {
    return budgets.map((budget) => BudgetMapper.toResponse(budget));
  }

  static toPersistence(budget: Budget) {
    return {
      id: budget.getId(),
      serviceOrderId: budget.getServiceOrderId(),
      version: budget.getVersion(),
      status: budget.getStatus(),
      totalCents: budget.getTotal().valueInCents,
      refusalReason: budget.getRefusalReason(),
      sentAt: budget.getSentAt(),
      answeredAt: budget.getAnsweredAt(),
      createdAt: budget.getCreatedAt(),
      updatedAt: budget.getUpdatedAt(),
      items: {
        create: budget
          .getItems()
          .map((item) => BudgetMapper.itemToPersistence(item)),
      },
    };
  }

  /**
   * Dinheiro é persistido em centavos inteiros e sai na API em decimais. O
   * domínio não participa dessas duas formas: ele só conhece `Money`, e a
   * conversão acontece aqui, na fronteira.
   */
  static itemToPersistence(
    item: Budget['getItems'] extends never
      ? never
      : ReturnType<Budget['getItems']>[number],
  ) {
    return {
      id: item.getId(),
      partId: item.getPartId(),
      serviceId: item.getServiceId(),
      description: item.getDescription(),
      type: item.getType(),
      quantity: item.getQuantity(),
      unitPriceCents: item.getUnitPrice().valueInCents,
      subtotalCents: item.getSubtotal().valueInCents,
    };
  }

  static toDomain(record: BudgetWithItems): Budget {
    return Budget.restore(record.id, {
      serviceOrderId: record.serviceOrderId,
      version: record.version,
      status: record.status,
      refusalReason: record.refusalReason,
      sentAt: record.sentAt,
      answeredAt: record.answeredAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      items: record.items.map((item) => ({
        id: item.id,
        partId: item.partId,
        serviceId: item.serviceId,
        description: item.description,
        type: item.type,
        quantity: Number(item.quantity),
        unitPrice: Money.fromCents(item.unitPriceCents),
      })),
    });
  }
}

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
      totalAmount: budget.getTotalAmount(),
      refusalReason: budget.getRefusalReason(),
      sentAt: budget.getSentAt(),
      answeredAt: budget.getAnsweredAt(),
      createdAt: budget.getCreatedAt(),
      updatedAt: budget.getUpdatedAt(),
      items: budget.getItems().map((item) => ({
        id: item.getId(),
        description: item.getDescription(),
        type: item.getType(),
        quantity: item.getQuantity(),
        unitPrice: item.getUnitPrice(),
        subtotal: item.getSubtotal(),
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
      totalCents: Money.fromDecimal(budget.getTotalAmount()).valueInCents,
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
   * Dinheiro é persistido sempre em centavos inteiros. A API continua em
   * decimais; a conversão acontece só aqui, na fronteira de persistência.
   */
  static itemToPersistence(
    item: Budget['getItems'] extends never
      ? never
      : ReturnType<Budget['getItems']>[number],
  ) {
    return {
      id: item.getId(),
      description: item.getDescription(),
      type: item.getType(),
      quantity: item.getQuantity(),
      unitPriceCents: Money.fromDecimal(item.getUnitPrice()).valueInCents,
      subtotalCents: Money.fromDecimal(item.getSubtotal()).valueInCents,
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
        description: item.description,
        type: item.type,
        quantity: Number(item.quantity),
        unitPrice: Money.fromCents(item.unitPriceCents).value,
      })),
    });
  }
}

import { Money } from '../../../../shared/domain/value-objects/money.vo';
import {
  Budget,
  BudgetItem,
  BudgetItemType,
  BudgetStatus,
} from '../../domain/entities/budget.entity';

export type BudgetRecord = {
  id: string;
  serviceOrderId: string;
  version: number;
  status: BudgetStatus | string;
  refusalReason: string | null;
  sentAt: Date | null;
  answeredAt: Date | null;
  approvalTokenHash: string | null;
  approvalTokenExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    partId: string | null;
    serviceId: string | null;
    description: string;
    type: BudgetItemType | string;
    quantity: unknown;
    unitPriceCents: number;
  }>;
};

/**
 * Dinheiro é persistido em centavos inteiros e sai na API em decimais. O
 * domínio não participa dessas duas formas: ele só conhece `Money`, e a
 * conversão acontece aqui, na fronteira.
 */
export class BudgetPersistenceMapper {
  static toCreate(budget: Budget) {
    return {
      id: budget.getId(),
      serviceOrderId: budget.getServiceOrderId(),
      version: budget.getVersion(),
      status: budget.getStatus(),
      totalCents: budget.getTotal().valueInCents,
      refusalReason: budget.getRefusalReason(),
      sentAt: budget.getSentAt(),
      answeredAt: budget.getAnsweredAt(),
      approvalTokenHash: budget.getApprovalTokenHash(),
      approvalTokenExpiresAt: budget.getApprovalTokenExpiresAt(),
      createdAt: budget.getCreatedAt(),
      updatedAt: budget.getUpdatedAt(),
      items: {
        create: budget
          .getItems()
          .map((item) => BudgetPersistenceMapper.itemToPersistence(item)),
      },
    };
  }

  static toUpdate(budget: Budget) {
    return {
      status: budget.getStatus(),
      totalCents: budget.getTotal().valueInCents,
      refusalReason: budget.getRefusalReason(),
      sentAt: budget.getSentAt(),
      answeredAt: budget.getAnsweredAt(),
      approvalTokenHash: budget.getApprovalTokenHash(),
      approvalTokenExpiresAt: budget.getApprovalTokenExpiresAt(),
      updatedAt: budget.getUpdatedAt(),
    };
  }

  static itemToPersistence(item: BudgetItem) {
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

  static toDomain(record: BudgetRecord): Budget {
    return Budget.restore(record.id, {
      serviceOrderId: record.serviceOrderId,
      version: record.version,
      status: record.status as BudgetStatus,
      refusalReason: record.refusalReason,
      sentAt: record.sentAt,
      answeredAt: record.answeredAt,
      approvalTokenHash: record.approvalTokenHash,
      approvalTokenExpiresAt: record.approvalTokenExpiresAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      items: record.items.map((item) => ({
        id: item.id,
        partId: item.partId,
        serviceId: item.serviceId,
        description: item.description,
        type: item.type as BudgetItemType,
        quantity: Number(item.quantity),
        unitPrice: Money.fromCents(item.unitPriceCents),
      })),
    });
  }
}

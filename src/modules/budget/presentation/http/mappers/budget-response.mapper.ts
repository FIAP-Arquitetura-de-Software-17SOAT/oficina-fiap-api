import { Budget } from '../../../domain/entities/budget.entity';
import { BudgetResponseDto } from '../dto/budget.dto';

export class BudgetResponseMapper {
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
    return budgets.map((budget) => BudgetResponseMapper.toResponse(budget));
  }
}

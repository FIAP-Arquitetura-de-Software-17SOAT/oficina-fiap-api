import {
  Budget,
  BudgetStatus,
} from '../src/modules/budget/entities/budget.entity';

export class InMemoryBudgetRepository {
  private readonly budgets = new Map<string, Budget>();

  create(budget: Budget): Promise<Budget> {
    const persisted = this.clone(budget);
    this.budgets.set(persisted.getId(), persisted);
    return Promise.resolve(this.clone(persisted));
  }

  updateGenerated(
    budget: Budget,
    expectedUpdatedAt: Date,
  ): Promise<Budget | null> {
    return this.updateWhenStatus(
      budget,
      BudgetStatus.GENERATED,
      expectedUpdatedAt,
    );
  }

  updateWaitingApproval(
    budget: Budget,
    expectedUpdatedAt: Date,
  ): Promise<Budget | null> {
    return this.updateWhenStatus(
      budget,
      BudgetStatus.WAITING_APPROVAL,
      expectedUpdatedAt,
    );
  }

  private updateWhenStatus(
    budget: Budget,
    expectedStatus: BudgetStatus,
    expectedUpdatedAt: Date,
  ): Promise<Budget | null> {
    const stored = this.budgets.get(budget.getId());

    if (
      !stored ||
      stored.getStatus() !== expectedStatus ||
      stored.getUpdatedAt().getTime() !== expectedUpdatedAt.getTime()
    ) {
      return Promise.resolve(null);
    }

    const persisted = this.clone(budget);
    this.budgets.set(persisted.getId(), persisted);
    return Promise.resolve(this.clone(persisted));
  }

  findById(id: string): Promise<Budget | null> {
    const budget = this.budgets.get(id);
    return Promise.resolve(budget ? this.clone(budget) : null);
  }

  findAll(): Promise<Budget[]> {
    return Promise.resolve(
      Array.from(this.budgets.values()).map((budget) => this.clone(budget)),
    );
  }

  findByServiceOrderId(serviceOrderId: string): Promise<Budget[]> {
    return Promise.resolve(
      Array.from(this.budgets.values())
        .filter((budget) => budget.getServiceOrderId() === serviceOrderId)
        // Versão mais recente primeiro, como o repositório Prisma.
        .sort((left, right) => right.getVersion() - left.getVersion())
        .map((budget) => this.clone(budget)),
    );
  }

  findWaitingApprovalByServiceOrderId(
    serviceOrderId: string,
  ): Promise<Budget | null> {
    const waiting = Array.from(this.budgets.values())
      .filter(
        (budget) =>
          budget.getServiceOrderId() === serviceOrderId &&
          budget.getStatus() === BudgetStatus.WAITING_APPROVAL,
      )
      .sort((left, right) => right.getVersion() - left.getVersion())[0];

    return Promise.resolve(waiting ? this.clone(waiting) : null);
  }

  findLastVersionByServiceOrderId(serviceOrderId: string): Promise<number> {
    const versions = Array.from(this.budgets.values())
      .filter((budget) => budget.getServiceOrderId() === serviceOrderId)
      .map((budget) => budget.getVersion());

    return Promise.resolve(versions.length ? Math.max(...versions) : 0);
  }

  private clone(budget: Budget): Budget {
    return Budget.restore(budget.getId(), {
      serviceOrderId: budget.getServiceOrderId(),
      version: budget.getVersion(),
      items: budget.getItems().map((item) => ({
        id: item.getId(),
        partId: item.getPartId(),
        serviceId: item.getServiceId(),
        description: item.getDescription(),
        type: item.getType(),
        quantity: item.getQuantity(),
        unitPrice: item.getUnitPrice(),
      })),
      status: budget.getStatus(),
      refusalReason: budget.getRefusalReason(),
      sentAt: budget.getSentAt(),
      answeredAt: budget.getAnsweredAt(),
      createdAt: budget.getCreatedAt(),
      updatedAt: budget.getUpdatedAt(),
    });
  }
}

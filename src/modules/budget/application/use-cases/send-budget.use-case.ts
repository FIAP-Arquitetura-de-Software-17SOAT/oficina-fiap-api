import { Budget } from '../../domain/entities/budget.entity';
import { BudgetNotifierPort } from '../ports/budget-notifier.port';
import { BudgetStore } from '../services/budget-store';

/**
 * O email do orçamento sai aqui, e não na criação: é o envio que deixa o
 * orçamento aguardando aprovação, e o link de aprovação que vai no email só
 * funciona a partir daí. Toda versão enviada ganha o seu email e o seu link.
 */
export class SendBudgetUseCase {
  constructor(
    private readonly store: BudgetStore,
    private readonly notifier: BudgetNotifierPort,
  ) {}

  async execute(id: string): Promise<Budget> {
    const budget = await this.store.findVisible(id);
    const expectedUpdatedAt = budget.getUpdatedAt();
    const approvalToken = budget.sendToClient();
    const sent = await this.store.persistGenerated(budget, expectedUpdatedAt);

    void this.notifier.budgetReady({
      serviceOrderId: sent.getServiceOrderId(),
      items: sent.getItems().map((item) => ({
        description: item.getDescription(),
        quantity: item.getQuantity(),
        unitPrice: item.getUnitPrice().value,
        subtotal: item.getSubtotal().value,
      })),
      total: sent.getTotal().value,
      approvalToken: approvalToken.value,
      approvalExpiresAt: sent.getApprovalTokenExpiresAt() as Date,
    });

    return sent;
  }
}

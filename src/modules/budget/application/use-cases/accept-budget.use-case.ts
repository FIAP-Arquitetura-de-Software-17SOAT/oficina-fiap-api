import { Budget, BudgetItemType } from '../../domain/entities/budget.entity';
import { BudgetNotifierPort } from '../ports/budget-notifier.port';
import { ServiceOrderPort } from '../ports/service-order.port';
import { BudgetStore } from '../services/budget-store';

/**
 * Políticas do Event Storming: "Quando o orçamento for aceito as peças e
 * insumos serão solicitados" e "Quando as peças forem solicitadas o status da
 * OS será alterado para aguardando peças". O board não bifurca aqui: todo
 * orçamento aceito passa pela solicitação de peças; um orçamento só de
 * serviços não tem o que baixar, e o despacho libera a OS direto.
 */
export class AcceptBudgetUseCase {
  constructor(
    private readonly store: BudgetStore,
    private readonly serviceOrders: ServiceOrderPort,
    private readonly notifier: BudgetNotifierPort,
  ) {}

  async execute(id: string, clientScope?: string): Promise<Budget> {
    const budget = await this.store.findVisible(id, clientScope);
    const expectedUpdatedAt = budget.getUpdatedAt();
    budget.accept();
    const accepted = await this.store.persistWaitingApprovalDecision(
      budget,
      expectedUpdatedAt,
    );

    await this.serviceOrders.awaitParts(accepted.getServiceOrderId());
    void this.notifier.stockPartsRequested({
      serviceOrderId: accepted.getServiceOrderId(),
      parts: accepted
        .getItems()
        .filter((item) => item.getType() === BudgetItemType.PART)
        .map((item) => ({
          description: item.getDescription(),
          quantity: item.getQuantity(),
        })),
    });

    return accepted;
  }
}

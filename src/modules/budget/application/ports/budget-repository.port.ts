import { Budget } from '../../domain/entities/budget.entity';

/**
 * A implementação traduz a violação de unicidade de `serviceOrderId +
 * version` em `BUDGET_VERSION_TAKEN` (o caso de uso tenta a próxima versão)
 * e qualquer outra unicidade em `BUDGET_VERSION_ALLOCATION`.
 */
export abstract class BudgetRepositoryPort {
  abstract create(budget: Budget): Promise<Budget>;
  /** Compare-and-set: só grava se o status ainda for GENERATED e `updatedAt` bater. */
  abstract updateGenerated(
    budget: Budget,
    expectedUpdatedAt: Date,
  ): Promise<Budget | null>;
  /** Compare-and-set: só grava se o status ainda for WAITING_APPROVAL e `updatedAt` bater. */
  abstract updateWaitingApproval(
    budget: Budget,
    expectedUpdatedAt: Date,
  ): Promise<Budget | null>;
  abstract findById(id: string): Promise<Budget | null>;
  /** Busca pelo hash do token do link do email — o token nunca é gravado. */
  abstract findByApprovalTokenHash(hash: string): Promise<Budget | null>;
  abstract findAll(): Promise<Budget[]>;
  /** Versão mais recente primeiro. */
  abstract findByServiceOrderId(serviceOrderId: string): Promise<Budget[]>;
  abstract findWaitingApprovalByServiceOrderId(
    serviceOrderId: string,
  ): Promise<Budget | null>;
  abstract findLastVersionByServiceOrderId(
    serviceOrderId: string,
  ): Promise<number>;
}

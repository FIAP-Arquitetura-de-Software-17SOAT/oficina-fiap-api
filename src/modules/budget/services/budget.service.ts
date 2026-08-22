import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateBudgetDto,
  CreateBudgetItemDto,
  RefuseBudgetDto,
} from '../dto/budget.dto';
import { ServiceOrderController } from '../../service-order/controllers/service-order.controller';
import { Budget } from '../entities/budget.entity';
import { BudgetRepository } from '../repositories/budget.repository';

@Injectable()
export class BudgetService {
  private static readonly MAX_VERSION_ALLOCATION_ATTEMPTS = 3;

  // A integracao entre modulos passa pelo controller do modulo alvo, nunca pelo
  // service ou repositorio dele. Guards do Nest so rodam em requisicao HTTP, entao
  // a chamada interna nao exige token: a autorizacao ja aconteceu na entrada.
  constructor(
    private readonly budgetRepository: BudgetRepository,
    private readonly serviceOrderController: ServiceOrderController,
  ) {}

  async create(dto: CreateBudgetDto): Promise<Budget> {
    const serviceOrderId = this.normalizeServiceOrderId(dto.serviceOrderId);

    const budget = await this.createWithNextAvailableVersion(
      serviceOrderId,
      dto.items,
    );

    // Politica do Event Storming: "Quando o orcamento for gerado, o status da OS
    // sera alterado para aguardando aprovacao". Reparo adicional aprovado durante
    // a execucao gera outro orcamento, e a OS ja nao esta mais em diagnostico -
    // nesse caso a transicao nao se aplica e o orcamento segue valido.
    if (budget.getVersion() === 1) {
      await this.serviceOrderController.awaitApproval(serviceOrderId);
    }

    return budget;
  }

  async addItem(id: string, dto: CreateBudgetItemDto): Promise<Budget> {
    const budget = await this.findById(id);
    const expectedUpdatedAt = budget.getUpdatedAt();
    budget.addItem(dto);
    return this.persistGeneratedChange(budget, expectedUpdatedAt);
  }

  async removeItem(id: string, itemId: string): Promise<Budget> {
    const budget = await this.findById(id);
    const expectedUpdatedAt = budget.getUpdatedAt();
    budget.removeItem(itemId);
    return this.persistGeneratedChange(budget, expectedUpdatedAt);
  }

  async calculateTotal(id: string): Promise<number> {
    const budget = await this.findById(id);
    return budget.getTotalAmount();
  }

  async send(id: string): Promise<Budget> {
    const budget = await this.findById(id);
    const expectedUpdatedAt = budget.getUpdatedAt();
    budget.sendToCustomer();
    return this.persistGeneratedChange(budget, expectedUpdatedAt);
  }

  async accept(id: string): Promise<Budget> {
    const budget = await this.findById(id);
    const expectedUpdatedAt = budget.getUpdatedAt();
    budget.accept();
    const accepted = await this.persistWaitingApprovalDecision(
      budget,
      expectedUpdatedAt,
    );

    await this.requestPartsForAcceptedBudget(accepted);

    return accepted;
  }

  async refuse(id: string, dto: RefuseBudgetDto): Promise<Budget> {
    const budget = await this.findById(id);
    const expectedUpdatedAt = budget.getUpdatedAt();
    budget.refuse(dto.reason);
    const refused = await this.persistWaitingApprovalDecision(
      budget,
      expectedUpdatedAt,
    );

    // Politica do Event Storming: "Quando Status do orcamento for alterado para
    // recusado, encerra a ordem de servico".
    await this.serviceOrderController.cancel(refused.getServiceOrderId(), {
      reason: `Orcamento recusado: ${refused.getRefusalReason()}`,
    });

    return refused;
  }

  /**
   * Politicas do Event Storming: "Quando o orcamento for aceito as pecas e
   * insumos serao solicitados" e "Quando as pecas forem solicitadas o status da
   * OS sera alterado para aguardando pecas".
   *
   * O board nao bifurca aqui: todo orcamento aceito passa pela solicitacao de
   * pecas. Um orcamento so de servicos nao tem o que baixar, e o despacho
   * resolve isso liberando a OS direto para execucao.
   */
  private async requestPartsForAcceptedBudget(budget: Budget): Promise<void> {
    await this.serviceOrderController.awaitParts(budget.getServiceOrderId());
  }

  async findById(id: string): Promise<Budget> {
    const budget = await this.budgetRepository.findById(id);

    if (!budget) {
      throw new NotFoundException('Budget not found');
    }

    return budget;
  }

  async findByServiceOrderId(serviceOrderId: string): Promise<Budget[]> {
    return this.budgetRepository.findByServiceOrderId(
      this.normalizeServiceOrderId(serviceOrderId),
    );
  }

  private async createWithNextAvailableVersion(
    serviceOrderId: string,
    items: CreateBudgetItemDto[],
  ): Promise<Budget> {
    for (
      let attempt = 0;
      attempt < BudgetService.MAX_VERSION_ALLOCATION_ATTEMPTS;
      attempt += 1
    ) {
      const lastVersion =
        await this.budgetRepository.findLastVersionByServiceOrderId(
          serviceOrderId,
        );
      const budget = Budget.create({
        serviceOrderId,
        version: lastVersion + 1,
        items,
      });

      try {
        return await this.budgetRepository.create(budget);
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) {
          throw error;
        }

        if (
          this.isVersionUniqueConstraintError(error) &&
          attempt < BudgetService.MAX_VERSION_ALLOCATION_ATTEMPTS - 1
        ) {
          continue;
        }

        throw new ConflictException('Could not allocate budget version');
      }
    }

    throw new ConflictException('Could not allocate budget version');
  }

  private async persistGeneratedChange(
    budget: Budget,
    expectedUpdatedAt: Date,
  ): Promise<Budget> {
    const updated = await this.budgetRepository.updateGenerated(
      budget,
      expectedUpdatedAt,
    );

    if (!updated) {
      throw new ConflictException(
        'Budget status was changed by another request',
      );
    }

    return updated;
  }

  private async persistWaitingApprovalDecision(
    budget: Budget,
    expectedUpdatedAt: Date,
  ): Promise<Budget> {
    const updated = await this.budgetRepository.updateWaitingApproval(
      budget,
      expectedUpdatedAt,
    );

    if (!updated) {
      throw new ConflictException(
        'Budget status was changed by another request',
      );
    }

    return updated;
  }

  private isUniqueConstraintError(error: unknown): error is { code: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private isVersionUniqueConstraintError(error: unknown): boolean {
    if (!this.isUniqueConstraintError(error)) {
      return false;
    }

    const fields = this.getUniqueConstraintFields(error);
    return (
      fields.some((field) => field.includes('serviceOrderId')) &&
      fields.some((field) => field.includes('version'))
    );
  }

  private getUniqueConstraintFields(error: unknown): string[] {
    if (typeof error !== 'object' || error === null || !('meta' in error)) {
      return [];
    }

    const meta = error.meta as {
      target?: unknown;
      driverAdapterError?: {
        cause?: { constraint?: { fields?: unknown } };
      };
    };
    const fields =
      meta.driverAdapterError?.cause?.constraint?.fields ?? meta.target;

    if (Array.isArray(fields)) {
      return fields.filter(
        (field): field is string => typeof field === 'string',
      );
    }

    return typeof fields === 'string' ? [fields] : [];
  }

  private normalizeServiceOrderId(serviceOrderId: string): string {
    return serviceOrderId.trim();
  }
}

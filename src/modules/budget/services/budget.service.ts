import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmail } from 'class-validator';
import {
  budgetReadyEmail,
  stockPartsRequestedEmail,
} from '../../../shared/notifications/email/notification-templates';
import {
  CreateBudgetDto,
  CreateBudgetItemDto,
  RefuseBudgetDto,
} from '../dto/budget.dto';
import { ServiceOrderController } from '../../service-order/controllers/service-order.controller';
import { ServiceOrderStatus } from '../../service-order/enums/service-order-status.enum';
import { ServiceController } from '../../service-catalog/controllers/service.controller';
import { PartController } from '../../stock/controllers/part.controller';
import { ClientRepository } from '../../client/repositories/client.repository';
import { NotificationType } from '../../notification/enums/notification-type.enum';
import { NotificationService } from '../../notification/services/notification.service';
import {
  Budget,
  BudgetItemProps,
  BudgetItemType,
} from '../entities/budget.entity';
import { Money } from '../../../shared/domain/value-objects/money.vo';
import { BudgetRepository } from '../repositories/budget.repository';

@Injectable()
export class BudgetService {
  private static readonly MAX_VERSION_ALLOCATION_ATTEMPTS = 3;
  private static readonly CLOSED_SERVICE_ORDER_STATUSES: string[] = [
    ServiceOrderStatus.CANCELLED,
    ServiceOrderStatus.COMPLETED,
    ServiceOrderStatus.DELIVERED,
  ];

  // A integracao entre modulos passa pelo controller do modulo alvo, nunca pelo
  // service ou repositorio dele. Guards do Nest so rodam em requisicao HTTP, entao
  // a chamada interna nao exige token: a autorizacao ja aconteceu na entrada.
  constructor(
    private readonly budgetRepository: BudgetRepository,
    private readonly serviceOrderController: ServiceOrderController,
    private readonly clientRepository: ClientRepository,
    private readonly notifications: NotificationService,
    private readonly config: ConfigService,
    private readonly serviceCatalogController: ServiceController,
    // forwardRef fecha o ciclo orçamento <-> estoque: o orçamento confere aqui a
    // peça que o item referencia, e o despacho de peças lê o orçamento aceito.
    @Inject(forwardRef(() => PartController))
    private readonly partController: PartController,
  ) {}

  async create(dto: CreateBudgetDto): Promise<Budget> {
    const serviceOrderId = this.normalizeServiceOrderId(dto.serviceOrderId);

    await this.assertReferencedCatalogsExist(dto.items);
    await this.assertServiceOrderAcceptsNewBudget(serviceOrderId);

    const budget = await this.createWithNextAvailableVersion(
      serviceOrderId,
      dto.items,
    );

    // Politica do Event Storming: "Quando o orcamento for gerado, o status da OS
    // sera alterado para aguardando aprovacao". Reparo adicional aprovado durante
    // a execucao gera outro orcamento, e a OS ja nao esta mais em diagnostico -
    // nesse caso a transicao nao se aplica e o orcamento segue valido.
    if (budget.getVersion() === 1) {
      const serviceOrder =
        await this.serviceOrderController.awaitApproval(serviceOrderId);
      void this.enqueueBudgetReadyNotification(budget, serviceOrder.clientId);
    }

    return budget;
  }

  async addItem(id: string, dto: CreateBudgetItemDto): Promise<Budget> {
    await this.assertReferencedCatalogsExist([dto]);

    const budget = await this.findById(id);
    const expectedUpdatedAt = budget.getUpdatedAt();
    budget.addItem(BudgetService.toItemProps(dto));
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
    return budget.getTotal().value;
  }

  async send(id: string): Promise<Budget> {
    const budget = await this.findById(id);
    const expectedUpdatedAt = budget.getUpdatedAt();
    budget.sendToClient();
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

  /**
   * Recusar orçamento **não** encerra a ordem de serviço.
   *
   * O board original dizia "quando o status do orçamento for alterado para
   * recusado, encerra a ordem de serviço", e era assim que estava
   * implementado. Na prática isso matava a negociação: o cliente achar caro a
   * primeira proposta é o caso comum, e a oficina precisa poder refazer o
   * orçamento sem abrir outra OS.
   *
   * A OS fica em `Aguardando aprovação` e o mecânico gera quantas versões
   * quiser. Desistir é decisão de quem atende, não consequência automática de
   * uma recusa: para isso existe `PATCH /service-orders/:id/cancel`, que exige
   * motivo.
   */
  async refuse(id: string, dto: RefuseBudgetDto): Promise<Budget> {
    const budget = await this.findById(id);
    const expectedUpdatedAt = budget.getUpdatedAt();
    budget.refuse(dto.reason);

    return this.persistWaitingApprovalDecision(budget, expectedUpdatedAt);
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
    void this.enqueueStockPartsRequestNotification(budget);
  }

  async findById(id: string): Promise<Budget> {
    const budget = await this.budgetRepository.findById(id);

    if (!budget) {
      throw new NotFoundException('Orçamento não encontrado');
    }

    return budget;
  }

  async findAll(): Promise<Budget[]> {
    return this.budgetRepository.findAll();
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
        items: items.map((item) => BudgetService.toItemProps(item)),
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

        throw new ConflictException(
          'Não foi possível alocar a versão do orçamento',
        );
      }
    }

    throw new ConflictException(
      'Não foi possível alocar a versão do orçamento',
    );
  }

  /**
   * Recusar orçamento não encerra a OS (ver `refuse`), então a criação de uma
   * nova versão continua liberada durante toda a negociação. O que não faz
   * sentido é orçar um atendimento que já terminou: OS cancelada, concluída ou
   * entregue não recebe proposta nova.
   *
   * Sem esta conferência a versão 2 era gravada em silêncio — só a versão 1
   * passa por `awaitApproval`, que é quem barraria a transição inválida.
   */
  private async assertServiceOrderAcceptsNewBudget(
    serviceOrderId: string,
  ): Promise<void> {
    const serviceOrder =
      await this.serviceOrderController.findById(serviceOrderId);

    if (
      BudgetService.CLOSED_SERVICE_ORDER_STATUSES.includes(serviceOrder.status)
    ) {
      throw new ConflictException(
        `Ordem de serviço ${serviceOrder.status} não aceita novo orçamento`,
      );
    }
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
        'O status do orçamento foi alterado por outra requisição',
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
        'O status do orçamento foi alterado por outra requisição',
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

  /**
   * O item guarda o preço como cópia, mas o `serviceId` precisa apontar para um
   * serviço que exista de verdade — senão o orçamento vira referência quebrada e
   * o erro só apareceria como violação de chave estrangeira, em 500.
   *
   * A consulta passa pelo controller do catálogo, e não pelo repositório dele:
   * é a convenção de integração entre módulos do projeto.
   */
  private async assertReferencedCatalogsExist(
    items: CreateBudgetItemDto[] = [],
  ): Promise<void> {
    await this.assertReferencedServicesExist(items);
    await this.assertReferencedPartsExist(items);
  }

  private async assertReferencedServicesExist(
    items: CreateBudgetItemDto[],
  ): Promise<void> {
    for (const serviceId of BudgetService.distinctRefs(
      items,
      (item) => item.serviceId,
    )) {
      await this.serviceCatalogController.findById(serviceId);
    }
  }

  /**
   * O mesmo cuidado do catálogo, do lado do estoque: sem esta conferência um
   * `partId` inexistente só era barrado pela chave estrangeira, o que chegava ao
   * cliente como 500 em vez de 404.
   */
  private async assertReferencedPartsExist(
    items: CreateBudgetItemDto[],
  ): Promise<void> {
    for (const partId of BudgetService.distinctRefs(
      items,
      (item) => item.partId,
    )) {
      await this.partController.findById(partId);
    }
  }

  private static distinctRefs(
    items: CreateBudgetItemDto[],
    pick: (item: CreateBudgetItemDto) => string | undefined,
  ): string[] {
    return [
      ...new Set(
        items
          .map((item) => pick(item)?.trim())
          .filter((ref): ref is string => Boolean(ref)),
      ),
    ];
  }

  private normalizeServiceOrderId(serviceOrderId: string): string {
    return serviceOrderId.trim();
  }

  /**
   * Fronteira entre o contrato HTTP e o domínio: o DTO traz o preço em decimal
   * porque JSON não tem tipo monetário, e o domínio só aceita `Money`. Antes o
   * DTO entrava direto no agregado porque as formas casavam por acidente, e o
   * orçamento acabava sendo o único agregado com dinheiro que não usava o VO.
   */
  private static toItemProps(dto: CreateBudgetItemDto): BudgetItemProps {
    return {
      partId: dto.partId,
      serviceId: dto.serviceId,
      description: dto.description,
      type: dto.type,
      quantity: dto.quantity,
      unitPrice: Money.fromDecimal(dto.unitPrice),
    };
  }

  private async enqueueBudgetReadyNotification(
    budget: Budget,
    clientId: string,
  ): Promise<void> {
    try {
      const client = await this.clientRepository.findById(clientId);
      if (!client) return;

      const items = budget.getItems();

      await this.notifications.enqueue({
        type: NotificationType.BUDGET_READY,
        to: client.getEmail().getValue(),
        ...budgetReadyEmail({
          serviceOrderId: budget.getServiceOrderId(),
          items: items.map((item) => ({
            description: item.getDescription(),
            quantity: item.getQuantity(),
            unitPrice: item.getUnitPrice().value,
            subtotal: item.getSubtotal().value,
          })),
          total: budget.getTotal().value,
        }),
      });
    } catch {
      // A criação do orçamento e a transição da OS já ocorreram. Falhas de
      // notificação não podem alterar esse resultado de negócio.
    }
  }

  private async enqueueStockPartsRequestNotification(
    budget: Budget,
  ): Promise<void> {
    try {
      const stockEmail = this.config
        .get<string>('STOCK_NOTIFICATION_EMAIL')
        ?.trim();

      if (!stockEmail || !isEmail(stockEmail)) return;

      const parts = budget
        .getItems()
        .filter((item) => item.getType() === BudgetItemType.PART);

      await this.notifications.enqueue({
        type: NotificationType.STOCK_PARTS_REQUESTED,
        to: stockEmail,
        ...stockPartsRequestedEmail({
          serviceOrderId: budget.getServiceOrderId(),
          parts: parts.map((item) => ({
            description: item.getDescription(),
            quantity: item.getQuantity(),
          })),
        }),
      });
    } catch {
      // O aceite do orçamento e a transição da OS já ocorreram. Falhas de
      // notificação não podem alterar esse resultado de negócio.
    }
  }
}

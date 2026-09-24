import { randomUUID } from 'crypto';
import { DomainException } from '../../../shared/domain/domain.exception';
import { Quantity } from '../../../shared/domain/value-objects/quantity.vo';
import { ServiceOrderStatus } from '../enums/service-order-status.enum';

/**
 * O que o cliente pediu ao abrir a OS. É pedido, não orçamento: não tem preço,
 * e o orçamento de verdade continua saindo depois do diagnóstico.
 */
export interface RequestedService {
  serviceId: string;
  quantity: number;
}

export interface RequestedPart {
  partId: string;
  quantity: number;
}

export interface ServiceOrderProps {
  clientId: string;
  vehicleId: string;
  description: string;
  requestedServices?: RequestedService[];
  requestedParts?: RequestedPart[];
  status?: ServiceOrderStatus;
  cancellationReason?: string | null;
  mechanicId?: string | null;
  assignedAt?: Date | null;
  partsDispatchedAt?: Date | null;
  completedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const ALLOWED_TRANSITIONS: Record<ServiceOrderStatus, ServiceOrderStatus[]> = {
  [ServiceOrderStatus.RECEIVED]: [
    ServiceOrderStatus.IN_DIAGNOSIS,
    ServiceOrderStatus.CANCELLED,
  ],
  [ServiceOrderStatus.IN_DIAGNOSIS]: [
    ServiceOrderStatus.AWAITING_APPROVAL,
    ServiceOrderStatus.CANCELLED,
  ],
  [ServiceOrderStatus.AWAITING_APPROVAL]: [
    ServiceOrderStatus.AWAITING_PARTS,
    ServiceOrderStatus.IN_PROGRESS,
    ServiceOrderStatus.CANCELLED,
  ],
  [ServiceOrderStatus.AWAITING_PARTS]: [
    ServiceOrderStatus.IN_PROGRESS,
    ServiceOrderStatus.CANCELLED,
  ],
  [ServiceOrderStatus.IN_PROGRESS]: [
    ServiceOrderStatus.COMPLETED,
    ServiceOrderStatus.CANCELLED,
  ],
  [ServiceOrderStatus.COMPLETED]: [
    ServiceOrderStatus.AWAITING_PAYMENT,
    ServiceOrderStatus.DELIVERED,
  ],
  // Cobrança em aberto: o cliente desistiu do checkout e a OS fica retida até
  // o pagamento. A única saída é a entrega, depois que a cobrança for quitada.
  [ServiceOrderStatus.AWAITING_PAYMENT]: [ServiceOrderStatus.DELIVERED],
  [ServiceOrderStatus.DELIVERED]: [],
  [ServiceOrderStatus.CANCELLED]: [],
};

/**
 * Ordem da listagem de OS pedida no enunciado da Fase 2: o que está em
 * execução primeiro, depois o que espera algo, até o que acabou de chegar.
 * AWAITING_PARTS e AWAITING_PAYMENT entram logo depois da execução, e a OS
 * cancelada fica por último.
 */
const LISTING_PRIORITY: ServiceOrderStatus[] = [
  ServiceOrderStatus.IN_PROGRESS,
  ServiceOrderStatus.AWAITING_PARTS,
  ServiceOrderStatus.AWAITING_PAYMENT,
  ServiceOrderStatus.AWAITING_APPROVAL,
  ServiceOrderStatus.IN_DIAGNOSIS,
  ServiceOrderStatus.RECEIVED,
  ServiceOrderStatus.CANCELLED,
];

export class ServiceOrder {
  /**
   * Exclusão lógica da listagem: a OS continua no banco e segue acessível por
   * id, só não aparece em `GET /service-orders`.
   */
  static readonly STATUSES_HIDDEN_FROM_LISTING: ServiceOrderStatus[] = [
    ServiceOrderStatus.COMPLETED,
    ServiceOrderStatus.DELIVERED,
  ];

  /** Prioridade do status e, dentro do mesmo status, a mais antiga primeiro. */
  static compareForListing(
    this: void,
    a: ServiceOrder,
    b: ServiceOrder,
  ): number {
    const byStatus =
      LISTING_PRIORITY.indexOf(a.status) - LISTING_PRIORITY.indexOf(b.status);

    return byStatus || a.createdAt.getTime() - b.createdAt.getTime();
  }

  private readonly id: string;
  private clientId: string;
  private vehicleId: string;
  private description: string;
  private requestedServices: RequestedService[];
  private requestedParts: RequestedPart[];
  private status: ServiceOrderStatus;
  private cancellationReason: string | null;
  private mechanicId: string | null;
  private assignedAt: Date | null;
  private partsDispatchedAt: Date | null;
  private completedAt: Date | null;
  private readonly createdAt: Date;
  private updatedAt: Date;

  private constructor(id: string, props: ServiceOrderProps) {
    this.id = id;

    this.setClientId(props.clientId);
    this.setVehicleId(props.vehicleId);
    this.setDescription(props.description);
    this.setRequestedServices(props.requestedServices ?? []);
    this.setRequestedParts(props.requestedParts ?? []);
    this.setStatus(props.status);

    this.cancellationReason = props.cancellationReason ?? null;
    this.mechanicId = props.mechanicId ?? null;
    this.assignedAt = props.assignedAt ?? null;
    this.partsDispatchedAt = props.partsDispatchedAt ?? null;
    this.completedAt = props.completedAt ?? null;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
  }

  static create(props: ServiceOrderProps): ServiceOrder {
    return new ServiceOrder(randomUUID(), props);
  }

  static restore(id: string, props: ServiceOrderProps): ServiceOrder {
    return new ServiceOrder(id, props);
  }

  getId(): string {
    return this.id;
  }

  getClientId(): string {
    return this.clientId;
  }

  getVehicleId(): string {
    return this.vehicleId;
  }

  getDescription(): string {
    return this.description;
  }

  getRequestedServices(): RequestedService[] {
    return this.requestedServices.map((service) => ({ ...service }));
  }

  getRequestedParts(): RequestedPart[] {
    return this.requestedParts.map((part) => ({ ...part }));
  }

  getStatus(): ServiceOrderStatus {
    return this.status;
  }

  getCancellationReason(): string | null {
    return this.cancellationReason;
  }

  getMechanicId(): string | null {
    return this.mechanicId;
  }

  getAssignedAt(): Date | null {
    return this.assignedAt;
  }

  getPartsDispatchedAt(): Date | null {
    return this.partsDispatchedAt;
  }

  getCompletedAt(): Date | null {
    return this.completedAt;
  }

  /**
   * O tempo que o enunciado cobra: conta do momento em que a OS foi atribuída
   * ao mecânico até a finalização, não da abertura. Nulo enquanto faltar uma
   * das duas pontas.
   */
  getExecutionTimeMs(): number | null {
    if (!this.assignedAt || !this.completedAt) {
      return null;
    }

    return this.completedAt.getTime() - this.assignedAt.getTime();
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  /**
   * Política do Event Storming: "Quando a OS for atribuída a um mecânico, o
   * status será alterado para 'em diagnóstico', e o timer será inicializado".
   */
  assignToMechanic(mechanicId: string): void {
    const trimmed = (mechanicId ?? '').trim();

    if (!trimmed) {
      throw new DomainException('Mecânico da ordem de serviço é obrigatório');
    }

    if (this.mechanicId) {
      throw new DomainException('Ordem de serviço já atribuída a um mecânico');
    }

    this.transitionTo(ServiceOrderStatus.IN_DIAGNOSIS);
    this.mechanicId = trimmed;
    this.assignedAt = new Date();
  }

  awaitApproval(): void {
    this.transitionTo(ServiceOrderStatus.AWAITING_APPROVAL);
  }

  awaitParts(): void {
    this.transitionTo(ServiceOrderStatus.AWAITING_PARTS);
  }

  /**
   * Única porta para IN_PROGRESS, e ela só abre pelo estoque.
   *
   * A tabela de transições sozinha diria que AWAITING_PARTS -> IN_PROGRESS é
   * permitido, sem perguntar se as peças saíram. Registrar o atendimento junto
   * com a transição é o que impede uma OS ser dada como em execução sem nenhuma
   * peça ter deixado a prateleira — e sem aparecer no tempo médio.
   */
  registerPartsDispatched(): void {
    if (!this.mechanicId) {
      throw new DomainException(
        'Ordem de serviço sem mecânico responsável não entra em execução',
      );
    }

    this.transitionTo(ServiceOrderStatus.IN_PROGRESS);
    this.partsDispatchedAt = new Date();
  }

  complete(): void {
    this.transitionTo(ServiceOrderStatus.COMPLETED);
    this.completedAt = new Date();
  }

  /**
   * Cobrança em aberto. Chamado quando o cliente abandona o checkout do
   * gateway: o serviço está pronto, mas a OS não é entregue enquanto o
   * pagamento não entrar.
   */
  awaitPayment(): void {
    this.transitionTo(ServiceOrderStatus.AWAITING_PAYMENT);
  }

  deliver(): void {
    this.transitionTo(ServiceOrderStatus.DELIVERED);
  }

  cancel(reason: string): void {
    const trimmed = (reason ?? '').trim();

    if (!trimmed) {
      throw new DomainException('Motivo do cancelamento é obrigatório');
    }

    this.transitionTo(ServiceOrderStatus.CANCELLED);
    this.cancellationReason = trimmed;
  }

  private transitionTo(target: ServiceOrderStatus): void {
    const allowed = ALLOWED_TRANSITIONS[this.status];

    if (!allowed.includes(target)) {
      throw new DomainException(
        `Transição de status inválida: ${this.status} -> ${target}`,
      );
    }

    this.status = target;
    this.touch();
  }

  private setClientId(clientId: string): void {
    const trimmed = (clientId ?? '').trim();

    if (!trimmed) {
      throw new DomainException('Cliente da ordem de serviço é obrigatório');
    }

    this.clientId = trimmed;
  }

  private setVehicleId(vehicleId: string): void {
    const trimmed = (vehicleId ?? '').trim();

    if (!trimmed) {
      throw new DomainException('Veículo da ordem de serviço é obrigatório');
    }

    this.vehicleId = trimmed;
  }

  private setDescription(description: string): void {
    const trimmed = (description ?? '').trim();

    if (!trimmed) {
      throw new DomainException('Descrição da ordem de serviço é obrigatória');
    }

    this.description = trimmed;
  }

  private setRequestedServices(services: RequestedService[]): void {
    this.requestedServices = ServiceOrder.requestedItems(
      services,
      (service) => service.serviceId,
      'Serviço pedido em duplicidade',
    ).map(({ ref, quantity }) => ({ serviceId: ref, quantity }));
  }

  private setRequestedParts(parts: RequestedPart[]): void {
    this.requestedParts = ServiceOrder.requestedItems(
      parts,
      (part) => part.partId,
      'Peça pedida em duplicidade',
    ).map(({ ref, quantity }) => ({ partId: ref, quantity }));
  }

  /**
   * Mesma regra para serviço e peça: referência preenchida, quantidade inteira
   * maior que zero (regra 17) e sem repetir o item — quem quer mais de um
   * informa a quantidade.
   */
  private static requestedItems<T extends { quantity: number }>(
    items: T[],
    pickRef: (item: T) => string,
    duplicateMessage: string,
  ): { ref: string; quantity: number }[] {
    const seen = new Set<string>();

    return items.map((item) => {
      const ref = (pickRef(item) ?? '').trim();

      if (!ref) {
        throw new DomainException('Item pedido sem referência');
      }

      if (seen.has(ref)) {
        throw new DomainException(duplicateMessage);
      }
      seen.add(ref);

      return { ref, quantity: Quantity.positive(item.quantity).getValue() };
    });
  }

  private setStatus(status: ServiceOrderStatus | undefined): void {
    if (status === undefined) {
      this.status = ServiceOrderStatus.RECEIVED;
      return;
    }

    if (!Object.values(ServiceOrderStatus).includes(status)) {
      throw new DomainException(
        `Status da ordem de serviço inválido: ${status}`,
      );
    }

    this.status = status;
  }

  private touch(): void {
    this.updatedAt = new Date();
  }
}

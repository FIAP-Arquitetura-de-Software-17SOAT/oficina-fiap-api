import { randomUUID } from 'crypto';
import { DomainException } from '../../../shared/domain/domain.exception';
import { ServiceOrderStatus } from '../enums/service-order-status.enum';

export interface ServiceOrderProps {
  clientId: string;
  vehicleId: string;
  description: string;
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

export class ServiceOrder {
  private readonly id: string;
  private clientId: string;
  private vehicleId: string;
  private description: string;
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

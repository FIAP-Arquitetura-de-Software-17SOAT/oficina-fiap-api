import { randomUUID } from 'crypto';
import { DomainException } from '../../../shared/domain/domain.exception';
import { ServiceOrderStatus } from '../enums/service-order-status.enum';

export interface ServiceOrderProps {
  clientId: string;
  vehicleId: string;
  description: string;
  status?: ServiceOrderStatus;
  cancellationReason?: string | null;
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
  [ServiceOrderStatus.COMPLETED]: [],
  [ServiceOrderStatus.CANCELLED]: [],
};

export class ServiceOrder {
  private readonly id: string;
  private clientId: string;
  private vehicleId: string;
  private description: string;
  private status: ServiceOrderStatus;
  private cancellationReason: string | null;
  private readonly createdAt: Date;
  private updatedAt: Date;

  private constructor(id: string, props: ServiceOrderProps) {
    this.id = id;

    this.setClientId(props.clientId);
    this.setVehicleId(props.vehicleId);
    this.setDescription(props.description);

    this.status = props.status ?? ServiceOrderStatus.RECEIVED;
    this.cancellationReason = props.cancellationReason ?? null;
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

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  startDiagnosis(): void {
    this.transitionTo(ServiceOrderStatus.IN_DIAGNOSIS);
  }

  awaitApproval(): void {
    this.transitionTo(ServiceOrderStatus.AWAITING_APPROVAL);
  }

  awaitParts(): void {
    this.transitionTo(ServiceOrderStatus.AWAITING_PARTS);
  }

  startProgress(): void {
    this.transitionTo(ServiceOrderStatus.IN_PROGRESS);
  }

  complete(): void {
    this.transitionTo(ServiceOrderStatus.COMPLETED);
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

  private touch(): void {
    this.updatedAt = new Date();
  }
}

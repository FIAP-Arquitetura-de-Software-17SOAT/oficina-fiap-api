import { ServiceOrder } from '../../domain/entities/service-order.entity';
import { ServiceOrderStatus } from '../../domain/enums/service-order-status.enum';

export abstract class ServiceOrderRepositoryPort {
  abstract create(serviceOrder: ServiceOrder): Promise<ServiceOrder>;
  abstract findById(id: string): Promise<ServiceOrder | null>;
  abstract findAllExcludingStatuses(
    statuses: ServiceOrderStatus[],
  ): Promise<ServiceOrder[]>;
  abstract findByClientId(clientId: string): Promise<ServiceOrder[]>;
  /** OS com `completedAt` e `assignedAt`: só elas têm tempo de execução. */
  abstract findCompleted(): Promise<ServiceOrder[]>;
  /** OS ativa do mecânico, para o invariante "uma OS por vez". */
  abstract findActiveByMechanicId(
    mechanicId: string,
  ): Promise<ServiceOrder | null>;
  abstract update(serviceOrder: ServiceOrder): Promise<ServiceOrder>;
}

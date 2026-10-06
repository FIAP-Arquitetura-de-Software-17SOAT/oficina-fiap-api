import { ServiceOrder } from '../../domain/entities/service-order.entity';
import { ServiceOrderRepositoryPort } from '../ports/service-order-repository.port';

/**
 * A listagem do enunciado: sem as OS finalizadas e entregues, ordenada pela
 * prioridade do status. A regra de ordem mora na entidade.
 */
export class ListServiceOrdersUseCase {
  constructor(private readonly serviceOrders: ServiceOrderRepositoryPort) {}

  async execute(): Promise<ServiceOrder[]> {
    const serviceOrders = await this.serviceOrders.findAllExcludingStatuses(
      ServiceOrder.STATUSES_HIDDEN_FROM_LISTING,
    );
    return serviceOrders.sort(ServiceOrder.compareForListing);
  }
}

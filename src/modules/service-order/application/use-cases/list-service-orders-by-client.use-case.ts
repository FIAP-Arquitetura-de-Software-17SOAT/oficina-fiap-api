import { ServiceOrder } from '../../domain/entities/service-order.entity';
import { ServiceOrderApplicationError } from '../errors/service-order-application.error';
import { ClientLookupPort } from '../ports/client-lookup.port';
import { ServiceOrderRepositoryPort } from '../ports/service-order-repository.port';

/**
 * O acompanhamento que o enunciado pede: o cliente vê onde cada OS dele está.
 * Lista vazia é resposta legítima; 404 aqui significa cliente inexistente.
 */
export class ListServiceOrdersByClientUseCase {
  constructor(
    private readonly serviceOrders: ServiceOrderRepositoryPort,
    private readonly clients: ClientLookupPort,
  ) {}

  async execute(clientId: string): Promise<ServiceOrder[]> {
    if (!(await this.clients.exists(clientId))) {
      throw new ServiceOrderApplicationError('CLIENT_NOT_FOUND');
    }
    return this.serviceOrders.findByClientId(clientId);
  }
}

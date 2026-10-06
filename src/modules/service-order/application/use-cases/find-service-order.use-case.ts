import { ServiceOrder } from '../../domain/entities/service-order.entity';
import { ServiceOrderApplicationError } from '../errors/service-order-application.error';
import { ServiceOrderRepositoryPort } from '../ports/service-order-repository.port';

export class FindServiceOrderUseCase {
  constructor(private readonly serviceOrders: ServiceOrderRepositoryPort) {}

  /**
   * `clientScope` é o cliente do CUSTOMER que pergunta. A OS de outro cliente
   * responde 404, como se não existisse — não revela que o id é válido.
   */
  async execute(id: string, clientScope?: string): Promise<ServiceOrder> {
    const serviceOrder = await this.serviceOrders.findById(id);

    if (
      !serviceOrder ||
      (clientScope !== undefined && serviceOrder.getClientId() !== clientScope)
    ) {
      throw new ServiceOrderApplicationError('SERVICE_ORDER_NOT_FOUND');
    }

    return serviceOrder;
  }
}

import { ServiceOrder } from '../../domain/entities/service-order.entity';
import { AssignMechanicInput } from '../contracts/service-order.input';
import { ServiceOrderApplicationError } from '../errors/service-order-application.error';
import { ServiceOrderRepositoryPort } from '../ports/service-order-repository.port';
import { ServiceOrderTransition } from '../services/service-order-transition';

/**
 * Política do Event Storming: atribuir a OS a um mecânico move o status para
 * IN_DIAGNOSIS e inicializa o timer. O board também diz que o mecânico não
 * pega outra OS antes de finalizar a atual — regra entre instâncias, então
 * mora aqui e não na entidade.
 */
export class AssignMechanicUseCase {
  constructor(
    private readonly serviceOrders: ServiceOrderRepositoryPort,
    private readonly transition: ServiceOrderTransition,
  ) {}

  async execute(id: string, input: AssignMechanicInput): Promise<ServiceOrder> {
    const serviceOrder = await this.transition.load(id);

    const active = await this.serviceOrders.findActiveByMechanicId(
      input.mechanicId,
    );
    if (active) {
      throw new ServiceOrderApplicationError('MECHANIC_BUSY', {
        activeServiceOrderId: active.getId(),
      });
    }

    serviceOrder.assignToMechanic(input.mechanicId);

    return this.transition.persist(serviceOrder);
  }
}

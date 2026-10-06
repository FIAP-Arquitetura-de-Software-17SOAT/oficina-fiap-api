import { ServiceOrder } from '../../domain/entities/service-order.entity';
import { CancelServiceOrderInput } from '../contracts/service-order.input';
import { ServiceOrderTransition } from '../services/service-order-transition';

export class CancelServiceOrderUseCase {
  constructor(private readonly transition: ServiceOrderTransition) {}

  async execute(
    id: string,
    input: CancelServiceOrderInput,
  ): Promise<ServiceOrder> {
    const serviceOrder = await this.transition.load(id);
    serviceOrder.cancel(input.reason);
    return this.transition.persist(serviceOrder);
  }
}

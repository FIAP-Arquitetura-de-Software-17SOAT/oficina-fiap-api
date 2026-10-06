import { ServiceOrder } from '../../domain/entities/service-order.entity';
import { StatusTransitionUseCase } from '../services/service-order-transition';

/** Sem rota HTTP. Só a cobrança paga entrega a OS. */
export class DeliverServiceOrderUseCase extends StatusTransitionUseCase {
  protected apply(serviceOrder: ServiceOrder): void {
    serviceOrder.deliver();
  }
}

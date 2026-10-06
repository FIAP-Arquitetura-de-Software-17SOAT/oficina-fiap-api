import { ServiceOrder } from '../../domain/entities/service-order.entity';
import { StatusTransitionUseCase } from '../services/service-order-transition';

/** Finaliza a OS; a partir daqui a cobrança pode ser gerada. */
export class CompleteServiceOrderUseCase extends StatusTransitionUseCase {
  protected apply(serviceOrder: ServiceOrder): void {
    serviceOrder.complete();
  }
}

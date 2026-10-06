import { ServiceOrder } from '../../domain/entities/service-order.entity';
import { StatusTransitionUseCase } from '../services/service-order-transition';

/** Sem rota HTTP. Quem move a OS para AWAITING_PARTS é a política de aceite do orçamento. */
export class AwaitPartsUseCase extends StatusTransitionUseCase {
  protected apply(serviceOrder: ServiceOrder): void {
    serviceOrder.awaitParts();
  }
}

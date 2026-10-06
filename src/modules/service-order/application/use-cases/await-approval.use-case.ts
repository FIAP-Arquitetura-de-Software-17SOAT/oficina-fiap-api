import { ServiceOrder } from '../../domain/entities/service-order.entity';
import { StatusTransitionUseCase } from '../services/service-order-transition';

/** Sem rota HTTP. Quem move a OS para AWAITING_APPROVAL é a política de geração do orçamento. */
export class AwaitApprovalUseCase extends StatusTransitionUseCase {
  protected apply(serviceOrder: ServiceOrder): void {
    serviceOrder.awaitApproval();
  }
}

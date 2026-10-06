import { ServiceOrder } from '../../domain/entities/service-order.entity';
import { StatusTransitionUseCase } from '../services/service-order-transition';

/** Sem rota HTTP. A OS só entra em execução pelas mãos do estoque, depois de as peças serem atendidas (módulo parts-dispatch). */
export class RegisterPartsDispatchedUseCase extends StatusTransitionUseCase {
  protected apply(serviceOrder: ServiceOrder): void {
    serviceOrder.registerPartsDispatched();
  }
}

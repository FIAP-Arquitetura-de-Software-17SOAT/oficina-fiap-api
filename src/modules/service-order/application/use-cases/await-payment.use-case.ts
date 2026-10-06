import { ServiceOrder } from '../../domain/entities/service-order.entity';
import { StatusTransitionUseCase } from '../services/service-order-transition';

/** Sem rota HTTP. Chamado pelo retorno de cancelamento do gateway de pagamento: a OS só cai em cobrança em aberto por decisão da cobrança. */
export class AwaitPaymentUseCase extends StatusTransitionUseCase {
  protected apply(serviceOrder: ServiceOrder): void {
    serviceOrder.awaitPayment();
  }
}

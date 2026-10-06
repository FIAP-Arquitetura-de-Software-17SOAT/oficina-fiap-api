import { ServiceOrder } from '../../domain/entities/service-order.entity';
import { ServiceOrderStatus } from '../../domain/enums/service-order-status.enum';
import { ServiceOrderApplicationError } from '../errors/service-order-application.error';
import { ServiceOrderNotifierPort } from '../ports/service-order-notifier.port';
import { ServiceOrderRepositoryPort } from '../ports/service-order-repository.port';

/**
 * Chegar em AWAITING_APPROVAL já dispara o email do orçamento, com os itens e
 * o total. Um segundo email dizendo só "aguardando aprovação" seria ruído.
 */
const STATUSES_WITHOUT_STATUS_EMAIL: ServiceOrderStatus[] = [
  ServiceOrderStatus.AWAITING_APPROVAL,
];

/**
 * O que toda mudança de status tem em comum: carregar a OS, gravar e avisar o
 * cliente. O aviso sai depois de gravar e não é aguardado — a "atualização de
 * status via email" do enunciado é consequência da transição, nunca condição.
 */
export class ServiceOrderTransition {
  constructor(
    private readonly serviceOrders: ServiceOrderRepositoryPort,
    private readonly notifier: ServiceOrderNotifierPort,
  ) {}

  async load(id: string): Promise<ServiceOrder> {
    const serviceOrder = await this.serviceOrders.findById(id);
    if (!serviceOrder) {
      throw new ServiceOrderApplicationError('SERVICE_ORDER_NOT_FOUND');
    }
    return serviceOrder;
  }

  async persist(serviceOrder: ServiceOrder): Promise<ServiceOrder> {
    const saved = await this.serviceOrders.update(serviceOrder);

    if (!STATUSES_WITHOUT_STATUS_EMAIL.includes(saved.getStatus())) {
      void this.notifier.statusChanged({
        clientId: saved.getClientId(),
        serviceOrderId: saved.getId(),
        status: saved.getStatus(),
        cancellationReason: saved.getCancellationReason(),
      });
    }

    return saved;
  }
}

/** Base das transições que só precisam do id: carrega, aplica, persiste. */
export abstract class StatusTransitionUseCase {
  constructor(protected readonly transition: ServiceOrderTransition) {}

  async execute(id: string): Promise<ServiceOrder> {
    const serviceOrder = await this.transition.load(id);
    this.apply(serviceOrder);
    return this.transition.persist(serviceOrder);
  }

  protected abstract apply(serviceOrder: ServiceOrder): void;
}

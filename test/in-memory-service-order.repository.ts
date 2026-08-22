import { ServiceOrder } from '../src/modules/service-order/entities/service-order.entity';

export class InMemoryServiceOrderRepository {
  private readonly serviceOrders = new Map<string, ServiceOrder>();

  create(serviceOrder: ServiceOrder): Promise<ServiceOrder> {
    this.serviceOrders.set(serviceOrder.getId(), serviceOrder);

    return Promise.resolve(serviceOrder);
  }

  findById(id: string): Promise<ServiceOrder | null> {
    return Promise.resolve(this.serviceOrders.get(id) ?? null);
  }

  findAll(): Promise<ServiceOrder[]> {
    return Promise.resolve(
      Array.from(this.serviceOrders.values()).sort(
        (a, b) => b.getCreatedAt().getTime() - a.getCreatedAt().getTime(),
      ),
    );
  }

  findByClientId(clientId: string): Promise<ServiceOrder[]> {
    return Promise.resolve(
      Array.from(this.serviceOrders.values())
        .filter((order) => order.getClientId() === clientId)
        .sort(
          (a, b) => b.getCreatedAt().getTime() - a.getCreatedAt().getTime(),
        ),
    );
  }

  findCompleted(): Promise<ServiceOrder[]> {
    return Promise.resolve(
      Array.from(this.serviceOrders.values())
        .filter(
          (order) =>
            order.getCompletedAt() !== null && order.getAssignedAt() !== null,
        )
        .sort(
          (a, b) => b.getCreatedAt().getTime() - a.getCreatedAt().getTime(),
        ),
    );
  }

  findActiveByMechanicId(mechanicId: string): Promise<ServiceOrder | null> {
    const active = [
      'IN_DIAGNOSIS',
      'AWAITING_APPROVAL',
      'AWAITING_PARTS',
      'IN_PROGRESS',
    ];

    return Promise.resolve(
      Array.from(this.serviceOrders.values()).find(
        (order) =>
          order.getMechanicId() === mechanicId &&
          active.includes(order.getStatus()),
      ) ?? null,
    );
  }

  update(serviceOrder: ServiceOrder): Promise<ServiceOrder> {
    this.serviceOrders.set(serviceOrder.getId(), serviceOrder);

    return Promise.resolve(serviceOrder);
  }
}

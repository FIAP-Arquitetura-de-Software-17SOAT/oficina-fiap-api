import { randomUUID } from 'node:crypto';
import { ServiceOrder } from '../../domain/entities/service-order.entity';
import { ServiceOrderStatus } from '../../domain/enums/service-order-status.enum';

export interface RequestedItemRow {
  type: string;
  serviceId: string | null;
  partId: string | null;
  quantity: number;
}

export interface ServiceOrderRow {
  id: string;
  clientId: string;
  vehicleId: string;
  description: string;
  status: string;
  cancellationReason: string | null;
  mechanicId: string | null;
  assignedAt: Date | null;
  partsDispatchedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  requestedItems?: RequestedItemRow[];
}

export class ServiceOrderPersistenceMapper {
  static toCreate(serviceOrder: ServiceOrder) {
    return {
      id: serviceOrder.getId(),
      clientId: serviceOrder.getClientId(),
      vehicleId: serviceOrder.getVehicleId(),
      description: serviceOrder.getDescription(),
      status: serviceOrder.getStatus(),
      cancellationReason: serviceOrder.getCancellationReason(),
      mechanicId: serviceOrder.getMechanicId(),
      assignedAt: serviceOrder.getAssignedAt(),
      partsDispatchedAt: serviceOrder.getPartsDispatchedAt(),
      completedAt: serviceOrder.getCompletedAt(),
      createdAt: serviceOrder.getCreatedAt(),
      updatedAt: serviceOrder.getUpdatedAt(),
      requestedItems: {
        create:
          ServiceOrderPersistenceMapper.requestedItemsToCreate(serviceOrder),
      },
    };
  }

  static requestedItemsToCreate(serviceOrder: ServiceOrder) {
    return [
      ...serviceOrder.getRequestedServices().map((service) => ({
        id: randomUUID(),
        type: 'SERVICE' as const,
        serviceId: service.serviceId,
        quantity: service.quantity,
      })),
      ...serviceOrder.getRequestedParts().map((part) => ({
        id: randomUUID(),
        type: 'PART' as const,
        partId: part.partId,
        quantity: part.quantity,
      })),
    ];
  }

  /** Só o que muda depois de aberta: status, marcos e motivo. */
  static toUpdate(serviceOrder: ServiceOrder) {
    return {
      status: serviceOrder.getStatus(),
      cancellationReason: serviceOrder.getCancellationReason(),
      mechanicId: serviceOrder.getMechanicId(),
      assignedAt: serviceOrder.getAssignedAt(),
      partsDispatchedAt: serviceOrder.getPartsDispatchedAt(),
      completedAt: serviceOrder.getCompletedAt(),
      updatedAt: serviceOrder.getUpdatedAt(),
    };
  }

  static toDomain(row: ServiceOrderRow): ServiceOrder {
    const items = row.requestedItems ?? [];

    return ServiceOrder.restore(row.id, {
      clientId: row.clientId,
      vehicleId: row.vehicleId,
      description: row.description,
      requestedServices: items
        .filter((item) => item.type === 'SERVICE' && item.serviceId)
        .map((item) => ({
          serviceId: item.serviceId as string,
          quantity: item.quantity,
        })),
      requestedParts: items
        .filter((item) => item.type === 'PART' && item.partId)
        .map((item) => ({
          partId: item.partId as string,
          quantity: item.quantity,
        })),
      status: row.status as ServiceOrderStatus,
      cancellationReason: row.cancellationReason,
      mechanicId: row.mechanicId,
      assignedAt: row.assignedAt,
      partsDispatchedAt: row.partsDispatchedAt,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}

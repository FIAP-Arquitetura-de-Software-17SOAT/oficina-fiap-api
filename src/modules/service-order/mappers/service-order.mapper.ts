import { ServiceOrderResponseDto } from '../dto/service-order.dto';
import { ServiceOrder } from '../entities/service-order.entity';

export class ServiceOrderMapper {
  static toResponse(serviceOrder: ServiceOrder): ServiceOrderResponseDto {
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
      executionTimeMs: serviceOrder.getExecutionTimeMs(),
      createdAt: serviceOrder.getCreatedAt(),
      updatedAt: serviceOrder.getUpdatedAt(),
    };
  }

  static toResponseList(
    serviceOrders: ServiceOrder[],
  ): ServiceOrderResponseDto[] {
    return serviceOrders.map((serviceOrder) =>
      ServiceOrderMapper.toResponse(serviceOrder),
    );
  }
}

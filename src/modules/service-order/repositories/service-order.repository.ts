import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderStatus } from '../enums/service-order-status.enum';

interface ServiceOrderRow {
  id: string;
  clientId: string;
  vehicleId: string;
  description: string;
  status: string;
  cancellationReason: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ServiceOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(serviceOrder: ServiceOrder): Promise<ServiceOrder> {
    const row = await this.prisma.serviceOrder.create({
      data: this.toPersistence(serviceOrder),
    });

    return this.toDomain(row);
  }

  async findById(id: string): Promise<ServiceOrder | null> {
    const row = await this.prisma.serviceOrder.findUnique({ where: { id } });

    return row ? this.toDomain(row) : null;
  }

  async findAll(): Promise<ServiceOrder[]> {
    const rows = await this.prisma.serviceOrder.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => this.toDomain(row));
  }

  async update(serviceOrder: ServiceOrder): Promise<ServiceOrder> {
    const row = await this.prisma.serviceOrder.update({
      where: { id: serviceOrder.getId() },
      data: {
        status: serviceOrder.getStatus(),
        cancellationReason: serviceOrder.getCancellationReason(),
        completedAt: serviceOrder.getCompletedAt(),
        updatedAt: serviceOrder.getUpdatedAt(),
      },
    });

    return this.toDomain(row);
  }

  private toPersistence(serviceOrder: ServiceOrder) {
    return {
      id: serviceOrder.getId(),
      clientId: serviceOrder.getClientId(),
      vehicleId: serviceOrder.getVehicleId(),
      description: serviceOrder.getDescription(),
      status: serviceOrder.getStatus(),
      cancellationReason: serviceOrder.getCancellationReason(),
      completedAt: serviceOrder.getCompletedAt(),
      createdAt: serviceOrder.getCreatedAt(),
      updatedAt: serviceOrder.getUpdatedAt(),
    };
  }

  private toDomain(row: ServiceOrderRow): ServiceOrder {
    return ServiceOrder.restore(row.id, {
      clientId: row.clientId,
      vehicleId: row.vehicleId,
      description: row.description,
      status: row.status as ServiceOrderStatus,
      cancellationReason: row.cancellationReason,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}

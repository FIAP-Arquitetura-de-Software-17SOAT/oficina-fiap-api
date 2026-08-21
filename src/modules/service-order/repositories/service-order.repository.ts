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
  mechanicId: string | null;
  assignedAt: Date | null;
  partsDispatchedAt: Date | null;
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

  async findByClientId(clientId: string): Promise<ServiceOrder[]> {
    const rows = await this.prisma.serviceOrder.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => this.toDomain(row));
  }

  async findCompleted(): Promise<ServiceOrder[]> {
    const rows = await this.prisma.serviceOrder.findMany({
      // O tempo de execução conta do início do timer, então OS finalizada sem
      // atribuição não entra na média.
      where: { completedAt: { not: null }, assignedAt: { not: null } },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => this.toDomain(row));
  }

  /**
   * Suporta o invariante "o mecânico não pode selecionar outra OS enquanto não
   * finalizar a atual". O índice único parcial no banco fecha a corrida; isto
   * aqui é o que devolve um erro legível antes dela.
   */
  async findActiveByMechanicId(
    mechanicId: string,
  ): Promise<ServiceOrder | null> {
    const row = await this.prisma.serviceOrder.findFirst({
      where: {
        mechanicId,
        status: {
          in: [
            ServiceOrderStatus.IN_DIAGNOSIS,
            ServiceOrderStatus.AWAITING_APPROVAL,
            ServiceOrderStatus.AWAITING_PARTS,
            ServiceOrderStatus.IN_PROGRESS,
          ],
        },
      },
    });

    return row ? this.toDomain(row) : null;
  }

  async update(serviceOrder: ServiceOrder): Promise<ServiceOrder> {
    const row = await this.prisma.serviceOrder.update({
      where: { id: serviceOrder.getId() },
      data: {
        status: serviceOrder.getStatus(),
        cancellationReason: serviceOrder.getCancellationReason(),
        mechanicId: serviceOrder.getMechanicId(),
        assignedAt: serviceOrder.getAssignedAt(),
        partsDispatchedAt: serviceOrder.getPartsDispatchedAt(),
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
      mechanicId: serviceOrder.getMechanicId(),
      assignedAt: serviceOrder.getAssignedAt(),
      partsDispatchedAt: serviceOrder.getPartsDispatchedAt(),
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
      mechanicId: row.mechanicId,
      assignedAt: row.assignedAt,
      partsDispatchedAt: row.partsDispatchedAt,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}

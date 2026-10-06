import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { ServiceOrder } from '../../domain/entities/service-order.entity';
import { ServiceOrderStatus } from '../../domain/enums/service-order-status.enum';
import { ServiceOrderRepositoryPort } from '../../application/ports/service-order-repository.port';
import { ServiceOrderPersistenceMapper } from './service-order-persistence.mapper';

// Os itens pedidos fazem parte da OS: toda leitura os traz junto.
const include = { requestedItems: true } as const;

@Injectable()
export class PrismaServiceOrderRepository implements ServiceOrderRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(serviceOrder: ServiceOrder): Promise<ServiceOrder> {
    const row = await this.prisma.serviceOrder.create({
      data: ServiceOrderPersistenceMapper.toCreate(serviceOrder),
      include,
    });
    return ServiceOrderPersistenceMapper.toDomain(row);
  }

  async findById(id: string): Promise<ServiceOrder | null> {
    const row = await this.prisma.serviceOrder.findUnique({
      where: { id },
      include,
    });
    return row ? ServiceOrderPersistenceMapper.toDomain(row) : null;
  }

  async findAllExcludingStatuses(
    statuses: ServiceOrderStatus[],
  ): Promise<ServiceOrder[]> {
    const rows = await this.prisma.serviceOrder.findMany({
      where: { status: { notIn: statuses } },
      orderBy: { createdAt: 'asc' },
      include,
    });
    return rows.map((row) => ServiceOrderPersistenceMapper.toDomain(row));
  }

  async findByClientId(clientId: string): Promise<ServiceOrder[]> {
    const rows = await this.prisma.serviceOrder.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      include,
    });
    return rows.map((row) => ServiceOrderPersistenceMapper.toDomain(row));
  }

  async findCompleted(): Promise<ServiceOrder[]> {
    const rows = await this.prisma.serviceOrder.findMany({
      // O tempo de execução conta do início do timer, então OS finalizada sem
      // atribuição não entra na média.
      where: { completedAt: { not: null }, assignedAt: { not: null } },
      orderBy: { createdAt: 'desc' },
      include,
    });
    return rows.map((row) => ServiceOrderPersistenceMapper.toDomain(row));
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
      include,
    });
    return row ? ServiceOrderPersistenceMapper.toDomain(row) : null;
  }

  async update(serviceOrder: ServiceOrder): Promise<ServiceOrder> {
    const row = await this.prisma.serviceOrder.update({
      where: { id: serviceOrder.getId() },
      data: ServiceOrderPersistenceMapper.toUpdate(serviceOrder),
      include,
    });
    return ServiceOrderPersistenceMapper.toDomain(row);
  }
}

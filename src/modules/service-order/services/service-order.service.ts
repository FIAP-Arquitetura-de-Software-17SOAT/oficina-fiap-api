import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClientRepository } from '../../client/repositories/client.repository';
import { ServiceController } from '../../service-catalog/controllers/service.controller';
import { VehicleController } from '../../vehicle/controllers/vehicle.controller';
import {
  AssignMechanicDto,
  CancelServiceOrderDto,
  OpenServiceOrderDto,
} from '../dto/service-order.dto';
import { ServiceOrder } from '../entities/service-order.entity';
import { PART_CATALOG } from '../ports/part-catalog.port';
import type { PartCatalog } from '../ports/part-catalog.port';
import { ServiceOrderRepository } from '../repositories/service-order.repository';

@Injectable()
export class ServiceOrderService {
  constructor(
    private readonly serviceOrderRepository: ServiceOrderRepository,
    private readonly clientRepository: ClientRepository,
    private readonly vehicleController: VehicleController,
    private readonly serviceCatalogController: ServiceController,
    @Inject(PART_CATALOG)
    private readonly partCatalog: PartCatalog,
  ) {}

  async openServiceOrder(dto: OpenServiceOrderDto): Promise<ServiceOrder> {
    const client = await this.clientRepository.findById(dto.clientId);

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    // O veículo precisa existir e ser do cliente da OS. Sem isso dá para abrir
    // ordem de serviço do cliente A com o carro do cliente B.
    const vehicle = await this.vehicleController.findById(dto.vehicleId);

    if (vehicle.clientId !== dto.clientId) {
      throw new BadRequestException(
        'Vehicle does not belong to the informed client',
      );
    }

    // Serviços e peças são opcionais, mas o que vier precisa existir: sem a
    // conferência o id inválido só esbarraria na chave estrangeira, em 500.
    for (const { serviceId } of dto.services ?? []) {
      await this.serviceCatalogController.findById(serviceId);
    }
    for (const { partId } of dto.parts ?? []) {
      await this.partCatalog.findById(partId);
    }

    const serviceOrder = ServiceOrder.create({
      clientId: dto.clientId,
      vehicleId: dto.vehicleId,
      description: dto.description,
      requestedServices: (dto.services ?? []).map((service) => ({
        serviceId: service.serviceId,
        quantity: service.quantity ?? 1,
      })),
      requestedParts: dto.parts ?? [],
    });

    return this.serviceOrderRepository.create(serviceOrder);
  }

  /**
   * `clientScope` é o cliente do CUSTOMER que pergunta. A OS de outro cliente
   * responde 404, como se não existisse — não revela que o id é válido.
   */
  async findById(id: string, clientScope?: string): Promise<ServiceOrder> {
    const serviceOrder = await this.serviceOrderRepository.findById(id);

    if (
      !serviceOrder ||
      (clientScope !== undefined && serviceOrder.getClientId() !== clientScope)
    ) {
      throw new NotFoundException('Service order not found');
    }

    return serviceOrder;
  }

  /**
   * A listagem do enunciado: sem as OS finalizadas e entregues, ordenada pela
   * prioridade do status. A regra de ordem mora na entidade.
   */
  async findAll(): Promise<ServiceOrder[]> {
    const serviceOrders =
      await this.serviceOrderRepository.findAllExcludingStatuses(
        ServiceOrder.STATUSES_HIDDEN_FROM_LISTING,
      );

    return serviceOrders.sort(ServiceOrder.compareForListing);
  }

  /**
   * O acompanhamento que o enunciado pede: o cliente vê onde cada OS dele está.
   * Lista vazia é resposta legítima; 404 aqui significa cliente inexistente.
   */
  async findByClientId(clientId: string): Promise<ServiceOrder[]> {
    const client = await this.clientRepository.findById(clientId);

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    return this.serviceOrderRepository.findByClientId(clientId);
  }

  /**
   * Política do Event Storming: atribuir a OS a um mecânico move o status para
   * IN_DIAGNOSIS e inicializa o timer. O board também diz que o mecânico não
   * pega outra OS antes de finalizar a atual — regra entre instâncias, então
   * mora aqui e não na entidade.
   */
  async assignToMechanic(
    id: string,
    dto: AssignMechanicDto,
  ): Promise<ServiceOrder> {
    const serviceOrder = await this.findById(id);

    const active = await this.serviceOrderRepository.findActiveByMechanicId(
      dto.mechanicId,
    );

    if (active) {
      throw new ConflictException(
        `Mechanic already has an open service order (${active.getId()})`,
      );
    }

    serviceOrder.assignToMechanic(dto.mechanicId);

    return this.serviceOrderRepository.update(serviceOrder);
  }

  async awaitApproval(id: string): Promise<ServiceOrder> {
    const serviceOrder = await this.findById(id);

    serviceOrder.awaitApproval();

    return this.serviceOrderRepository.update(serviceOrder);
  }

  async awaitParts(id: string): Promise<ServiceOrder> {
    const serviceOrder = await this.findById(id);

    serviceOrder.awaitParts();

    return this.serviceOrderRepository.update(serviceOrder);
  }

  /**
   * Chamado pelo estoque depois de atender as peças da OS. Não é endpoint: a
   * única forma de a OS entrar em execução é o estoque tê-la atendido.
   */
  async registerPartsDispatched(id: string): Promise<ServiceOrder> {
    const serviceOrder = await this.findById(id);

    serviceOrder.registerPartsDispatched();

    return this.serviceOrderRepository.update(serviceOrder);
  }

  async complete(id: string): Promise<ServiceOrder> {
    const serviceOrder = await this.findById(id);

    serviceOrder.complete();

    return this.serviceOrderRepository.update(serviceOrder);
  }

  /**
   * Chamado pelo retorno de cancelamento do gateway de pagamento. Não é
   * endpoint: a OS só cai em cobrança em aberto por decisão da cobrança.
   */
  async awaitPayment(id: string): Promise<ServiceOrder> {
    const serviceOrder = await this.findById(id);

    serviceOrder.awaitPayment();

    return this.serviceOrderRepository.update(serviceOrder);
  }

  async deliver(id: string): Promise<ServiceOrder> {
    const serviceOrder = await this.findById(id);

    serviceOrder.deliver();

    return this.serviceOrderRepository.update(serviceOrder);
  }

  async cancel(id: string, dto: CancelServiceOrderDto): Promise<ServiceOrder> {
    const serviceOrder = await this.findById(id);

    serviceOrder.cancel(dto.reason);

    return this.serviceOrderRepository.update(serviceOrder);
  }

  async getAverageExecutionTime(): Promise<{
    averageExecutionTimeMs: number | null;
    sampleSize: number;
  }> {
    const completed = await this.serviceOrderRepository.findCompleted();

    if (completed.length === 0) {
      return { averageExecutionTimeMs: null, sampleSize: 0 };
    }

    // O timer do board começa na atribuição ao mecânico, não na abertura da OS.
    const totalMs = completed.reduce(
      (sum, serviceOrder) => sum + (serviceOrder.getExecutionTimeMs() ?? 0),
      0,
    );

    return {
      averageExecutionTimeMs: Math.round(totalMs / completed.length),
      sampleSize: completed.length,
    };
  }
}

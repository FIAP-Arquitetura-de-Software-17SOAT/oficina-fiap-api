import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClientRepository } from '../../client/repositories/client.repository';
import { VehicleController } from '../../vehicle/controllers/vehicle.controller';
import {
  AssignMechanicDto,
  CancelServiceOrderDto,
  OpenServiceOrderDto,
} from '../dto/service-order.dto';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderRepository } from '../repositories/service-order.repository';

@Injectable()
export class ServiceOrderService {
  constructor(
    private readonly serviceOrderRepository: ServiceOrderRepository,
    private readonly clientRepository: ClientRepository,
    private readonly vehicleController: VehicleController,
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

    const serviceOrder = ServiceOrder.create({
      clientId: dto.clientId,
      vehicleId: dto.vehicleId,
      description: dto.description,
    });

    return this.serviceOrderRepository.create(serviceOrder);
  }

  async findById(id: string): Promise<ServiceOrder> {
    const serviceOrder = await this.serviceOrderRepository.findById(id);

    if (!serviceOrder) {
      throw new NotFoundException('Service order not found');
    }

    return serviceOrder;
  }

  async findAll(): Promise<ServiceOrder[]> {
    return this.serviceOrderRepository.findAll();
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

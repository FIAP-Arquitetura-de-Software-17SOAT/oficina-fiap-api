import { Injectable, NotFoundException } from '@nestjs/common';
import { ClientService } from '../../client/services/client.service';
import {
  CancelServiceOrderDto,
  OpenServiceOrderDto,
} from '../dto/service-order.dto';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderRepository } from '../repositories/service-order.repository';

@Injectable()
export class ServiceOrderService {
  constructor(
    private readonly serviceOrderRepository: ServiceOrderRepository,
    private readonly clientService: ClientService,
  ) {}

  async openServiceOrder(dto: OpenServiceOrderDto): Promise<ServiceOrder> {
    await this.clientService.findById(dto.clientId);

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

  async startDiagnosis(id: string): Promise<ServiceOrder> {
    const serviceOrder = await this.findById(id);

    serviceOrder.startDiagnosis();

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

  async startProgress(id: string): Promise<ServiceOrder> {
    const serviceOrder = await this.findById(id);

    serviceOrder.startProgress();

    return this.serviceOrderRepository.update(serviceOrder);
  }

  async complete(id: string): Promise<ServiceOrder> {
    const serviceOrder = await this.findById(id);

    serviceOrder.complete();

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
}

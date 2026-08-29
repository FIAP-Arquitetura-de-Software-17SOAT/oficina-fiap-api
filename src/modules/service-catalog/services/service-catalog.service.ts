import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateServiceDto, UpdateServiceDto } from '../dto/service.dto';
import { Service } from '../entities/service.entity';
import { ServiceRepository } from '../repositories/service.repository';

@Injectable()
export class ServiceCatalogService {
  constructor(private readonly serviceRepository: ServiceRepository) {}

  async create(dto: CreateServiceDto): Promise<Service> {
    await this.assertNameIsAvailable(dto.name);

    const service = Service.create({
      name: dto.name,
      description: dto.description,
      price: dto.price,
    });

    return this.serviceRepository.create(service);
  }

  async findAll(): Promise<Service[]> {
    return this.serviceRepository.findAll();
  }

  async findById(id: string): Promise<Service> {
    const service = await this.serviceRepository.findById(id);

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    return service;
  }

  async update(id: string, dto: UpdateServiceDto): Promise<Service> {
    const service = await this.findById(id);

    if (dto.name !== undefined) {
      await this.assertNameIsAvailable(dto.name, id);
      service.changeName(dto.name);
    }

    if (dto.description !== undefined) {
      service.changeDescription(dto.description);
    }

    if (dto.price !== undefined) {
      service.changePrice(dto.price);
    }

    return this.serviceRepository.update(service);
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);

    await this.serviceRepository.delete(id);
  }

  private async assertNameIsAvailable(
    name: string,
    allowedServiceId?: string,
  ): Promise<void> {
    const existing = await this.serviceRepository.findByName(name.trim());

    if (existing && existing.getId() !== allowedServiceId) {
      throw new ConflictException('Service already exists');
    }
  }
}

import { Service } from '../../domain/entities/service.entity';
import { ServiceCatalogApplicationError } from '../errors/service-catalog-application.error';
import { ServiceRepositoryPort } from '../ports/service-repository.port';

export class FindServiceUseCase {
  constructor(private readonly services: ServiceRepositoryPort) {}

  async execute(id: string): Promise<Service> {
    const service = await this.services.findById(id);
    if (!service) {
      throw new ServiceCatalogApplicationError('SERVICE_NOT_FOUND');
    }
    return service;
  }
}

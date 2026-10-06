import { Service } from '../../domain/entities/service.entity';
import { ServiceRepositoryPort } from '../ports/service-repository.port';

export class ListServicesUseCase {
  constructor(private readonly services: ServiceRepositoryPort) {}

  execute(): Promise<Service[]> {
    return this.services.findAll();
  }
}

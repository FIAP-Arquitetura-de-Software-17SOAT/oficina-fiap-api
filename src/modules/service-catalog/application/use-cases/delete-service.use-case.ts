import { ServiceRepositoryPort } from '../ports/service-repository.port';
import { FindServiceUseCase } from './find-service.use-case';

export class DeleteServiceUseCase {
  constructor(private readonly services: ServiceRepositoryPort) {}

  async execute(id: string): Promise<void> {
    await new FindServiceUseCase(this.services).execute(id);
    await this.services.delete(id);
  }
}

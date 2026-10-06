import { Money } from '../../../../shared/domain/value-objects/money.vo';
import { Service } from '../../domain/entities/service.entity';
import { UpdateServiceInput } from '../contracts/service.input';
import { ServiceCatalogApplicationError } from '../errors/service-catalog-application.error';
import { ServiceRepositoryPort } from '../ports/service-repository.port';
import { FindServiceUseCase } from './find-service.use-case';

export class UpdateServiceUseCase {
  constructor(private readonly services: ServiceRepositoryPort) {}

  async execute(id: string, input: UpdateServiceInput): Promise<Service> {
    const service = await new FindServiceUseCase(this.services).execute(id);

    if (input.name !== undefined) {
      const existing = await this.services.findByName(input.name.trim());
      if (existing && existing.getId() !== id) {
        throw new ServiceCatalogApplicationError('SERVICE_NAME_IN_USE');
      }
      service.changeName(input.name);
    }
    if (input.description !== undefined) {
      service.changeDescription(input.description);
    }
    if (input.price !== undefined) {
      service.changePrice(Money.fromDecimal(input.price));
    }

    return this.services.update(service);
  }
}

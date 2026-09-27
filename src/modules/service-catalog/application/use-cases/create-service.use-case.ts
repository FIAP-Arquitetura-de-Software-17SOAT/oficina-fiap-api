import { Money } from '../../../../shared/domain/value-objects/money.vo';
import { Service } from '../../domain/entities/service.entity';
import { CreateServiceInput } from '../contracts/service.input';
import { ServiceCatalogApplicationError } from '../errors/service-catalog-application.error';
import { ServiceRepositoryPort } from '../ports/service-repository.port';

export class CreateServiceUseCase {
  constructor(private readonly services: ServiceRepositoryPort) {}

  async execute(input: CreateServiceInput): Promise<Service> {
    if (await this.services.findByName(input.name.trim())) {
      throw new ServiceCatalogApplicationError('SERVICE_NAME_IN_USE');
    }

    return this.services.create(
      Service.create({
        name: input.name,
        description: input.description,
        price: Money.fromDecimal(input.price),
      }),
    );
  }
}

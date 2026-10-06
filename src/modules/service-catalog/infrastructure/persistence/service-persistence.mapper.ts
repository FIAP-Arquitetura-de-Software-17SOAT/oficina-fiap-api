import { Money } from '../../../../shared/domain/value-objects/money.vo';
import { Service } from '../../domain/entities/service.entity';

interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  createdAt: Date;
  updatedAt: Date;
}

export class ServicePersistenceMapper {
  static toPersistence(service: Service): ServiceRow {
    return {
      id: service.getId(),
      name: service.getName(),
      description: service.getDescription() ?? null,
      priceCents: service.getPrice().valueInCents,
      createdAt: service.getCreatedAt(),
      updatedAt: service.getUpdatedAt(),
    };
  }

  static toUpdate(service: Service) {
    return {
      name: service.getName(),
      description: service.getDescription() ?? null,
      priceCents: service.getPrice().valueInCents,
      updatedAt: service.getUpdatedAt(),
    };
  }

  static toDomain(row: ServiceRow): Service {
    return Service.restore(row.id, {
      name: row.name,
      description: row.description,
      price: Money.fromCents(row.priceCents),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}

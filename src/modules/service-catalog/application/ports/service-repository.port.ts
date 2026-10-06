import { Service } from '../../domain/entities/service.entity';

export abstract class ServiceRepositoryPort {
  abstract create(service: Service): Promise<Service>;
  abstract findById(id: string): Promise<Service | null>;
  abstract findByName(name: string): Promise<Service | null>;
  abstract findAll(): Promise<Service[]>;
  abstract update(service: Service): Promise<Service>;
  abstract delete(id: string): Promise<void>;
}

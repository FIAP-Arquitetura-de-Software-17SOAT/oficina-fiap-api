import { Service } from '../src/modules/service-catalog/entities/service.entity';

/**
 * Substitui o Prisma nos testes de integração do catálogo: exercita o pipeline
 * HTTP inteiro (validação, filtro de domínio, service, entidade e mapper) sem
 * depender de um banco em pé.
 */
export class InMemoryServiceRepository {
  private readonly services = new Map<string, Service>();

  create(service: Service): Promise<Service> {
    this.services.set(service.getId(), service);

    return Promise.resolve(service);
  }

  findById(id: string): Promise<Service | null> {
    return Promise.resolve(this.services.get(id) ?? null);
  }

  findByName(name: string): Promise<Service | null> {
    return Promise.resolve(
      this.all().find((service) => service.getName() === name) ?? null,
    );
  }

  findAll(): Promise<Service[]> {
    return Promise.resolve(
      this.all().sort(
        (a, b) => b.getCreatedAt().getTime() - a.getCreatedAt().getTime(),
      ),
    );
  }

  update(service: Service): Promise<Service> {
    this.services.set(service.getId(), service);

    return Promise.resolve(service);
  }

  delete(id: string): Promise<void> {
    this.services.delete(id);

    return Promise.resolve();
  }

  private all(): Service[] {
    return Array.from(this.services.values());
  }
}

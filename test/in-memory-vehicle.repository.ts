import { Vehicle } from '../src/modules/vehicle/entities/vehicle.entity';

/**
 * Substitui o Prisma nos testes de integração do módulo de veículos.
 * Ver `in-memory-client.repository.ts` para o racional.
 */
export class InMemoryVehicleRepository {
  private readonly vehicles = new Map<string, Vehicle>();

  create(vehicle: Vehicle): Promise<Vehicle> {
    this.vehicles.set(vehicle.getId(), vehicle);

    return Promise.resolve(vehicle);
  }

  findById(id: string): Promise<Vehicle | null> {
    return Promise.resolve(this.vehicles.get(id) ?? null);
  }

  findByPlate(plate: string): Promise<Vehicle | null> {
    return Promise.resolve(
      this.all().find((v) => v.getPlate().getValue() === plate) ?? null,
    );
  }

  findAll(clientId?: string): Promise<Vehicle[]> {
    const vehicles = clientId
      ? this.all().filter((v) => v.getClientId() === clientId)
      : this.all();

    return Promise.resolve(
      vehicles.sort(
        (a, b) => b.getCreatedAt().getTime() - a.getCreatedAt().getTime(),
      ),
    );
  }

  update(vehicle: Vehicle): Promise<Vehicle> {
    this.vehicles.set(vehicle.getId(), vehicle);

    return Promise.resolve(vehicle);
  }

  delete(id: string): Promise<void> {
    this.vehicles.delete(id);

    return Promise.resolve();
  }

  private all(): Vehicle[] {
    return Array.from(this.vehicles.values());
  }
}

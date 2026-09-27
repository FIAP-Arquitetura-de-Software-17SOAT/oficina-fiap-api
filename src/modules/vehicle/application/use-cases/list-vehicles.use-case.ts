import { Vehicle } from '../../domain/entities/vehicle.entity';
import { VehicleApplicationError } from '../errors/vehicle-application.error';
import { ClientLookupPort } from '../ports/client-lookup.port';
import { VehicleRepositoryPort } from '../ports/vehicle-repository.port';

export class ListVehiclesUseCase {
  constructor(
    private readonly vehicles: VehicleRepositoryPort,
    private readonly clients: ClientLookupPort,
  ) {}

  async execute(clientId?: string): Promise<Vehicle[]> {
    if (clientId && !(await this.clients.exists(clientId))) {
      throw new VehicleApplicationError('CLIENT_NOT_FOUND');
    }
    return this.vehicles.findAll(clientId);
  }
}

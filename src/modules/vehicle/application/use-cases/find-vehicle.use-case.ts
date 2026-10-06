import { Vehicle } from '../../domain/entities/vehicle.entity';
import { VehicleApplicationError } from '../errors/vehicle-application.error';
import { VehicleRepositoryPort } from '../ports/vehicle-repository.port';

export class FindVehicleUseCase {
  constructor(private readonly vehicles: VehicleRepositoryPort) {}

  async execute(id: string): Promise<Vehicle> {
    const vehicle = await this.vehicles.findById(id);
    if (!vehicle) throw new VehicleApplicationError('VEHICLE_NOT_FOUND');
    return vehicle;
  }
}

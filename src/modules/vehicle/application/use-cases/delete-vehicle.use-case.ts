import { VehicleRepositoryPort } from '../ports/vehicle-repository.port';
import { FindVehicleUseCase } from './find-vehicle.use-case';

export class DeleteVehicleUseCase {
  constructor(private readonly vehicles: VehicleRepositoryPort) {}

  async execute(id: string): Promise<void> {
    await new FindVehicleUseCase(this.vehicles).execute(id);
    await this.vehicles.delete(id);
  }
}

import { Vehicle } from '../../domain/entities/vehicle.entity';
import { UpdateVehicleInput } from '../contracts/vehicle.input';
import { VehicleRepositoryPort } from '../ports/vehicle-repository.port';
import { FindVehicleUseCase } from './find-vehicle.use-case';

export class UpdateVehicleUseCase {
  constructor(private readonly vehicles: VehicleRepositoryPort) {}

  async execute(id: string, input: UpdateVehicleInput): Promise<Vehicle> {
    const vehicle = await new FindVehicleUseCase(this.vehicles).execute(id);

    if (input.brand) vehicle.changeBrand(input.brand);
    if (input.model) vehicle.changeModel(input.model);
    if (input.year !== undefined) vehicle.changeYear(input.year);

    return this.vehicles.update(vehicle);
  }
}

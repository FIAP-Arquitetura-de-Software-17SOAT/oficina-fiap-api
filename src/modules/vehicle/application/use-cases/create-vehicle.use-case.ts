import { Vehicle } from '../../domain/entities/vehicle.entity';
import { Plate } from '../../domain/value-objects/plate.vo';
import { CreateVehicleInput } from '../contracts/vehicle.input';
import { VehicleApplicationError } from '../errors/vehicle-application.error';
import { ClientLookupPort } from '../ports/client-lookup.port';
import { VehicleRepositoryPort } from '../ports/vehicle-repository.port';

export class CreateVehicleUseCase {
  constructor(
    private readonly vehicles: VehicleRepositoryPort,
    private readonly clients: ClientLookupPort,
  ) {}

  async execute(input: CreateVehicleInput): Promise<Vehicle> {
    // Normaliza pela VO antes de consultar: "abc-1d23" e "ABC1D23" são a mesma
    // placa, e o banco guarda apenas a forma normalizada.
    const plate = Plate.create(input.plate);

    // O dono precisa existir antes de gravar, senão nasce um veículo órfão.
    if (!(await this.clients.exists(input.clientId))) {
      throw new VehicleApplicationError('CLIENT_NOT_FOUND');
    }
    if (await this.vehicles.findByPlate(plate.getValue())) {
      throw new VehicleApplicationError('VEHICLE_ALREADY_EXISTS');
    }

    return this.vehicles.create(
      Vehicle.create({ ...input, plate: plate.getValue() }),
    );
  }
}

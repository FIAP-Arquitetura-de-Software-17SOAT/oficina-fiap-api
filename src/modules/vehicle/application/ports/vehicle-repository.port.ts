import { Vehicle } from '../../domain/entities/vehicle.entity';

export abstract class VehicleRepositoryPort {
  abstract create(vehicle: Vehicle): Promise<Vehicle>;
  abstract findById(id: string): Promise<Vehicle | null>;
  abstract findByPlate(plate: string): Promise<Vehicle | null>;
  abstract findAll(clientId?: string): Promise<Vehicle[]>;
  abstract update(vehicle: Vehicle): Promise<Vehicle>;
  abstract delete(id: string): Promise<void>;
}

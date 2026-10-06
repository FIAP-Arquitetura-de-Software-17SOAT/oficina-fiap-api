import { Injectable } from '@nestjs/common';
import { VehicleApplicationError } from '../../../vehicle/application/errors/vehicle-application.error';
import { FindVehicleUseCase } from '../../../vehicle/application/use-cases/find-vehicle.use-case';
import {
  VehicleLookupPort,
  VehicleSummary,
} from '../../application/ports/vehicle-lookup.port';

@Injectable()
export class VehicleLookupAdapter implements VehicleLookupPort {
  constructor(private readonly findVehicle: FindVehicleUseCase) {}

  async findById(vehicleId: string): Promise<VehicleSummary | null> {
    try {
      const vehicle = await this.findVehicle.execute(vehicleId);
      return { id: vehicle.getId(), clientId: vehicle.getClientId() };
    } catch (error) {
      if (
        error instanceof VehicleApplicationError &&
        error.code === 'VEHICLE_NOT_FOUND'
      ) {
        return null;
      }
      throw error;
    }
  }
}

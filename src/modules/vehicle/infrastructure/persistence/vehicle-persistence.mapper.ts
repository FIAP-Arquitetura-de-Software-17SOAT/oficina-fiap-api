import { Vehicle } from '../../domain/entities/vehicle.entity';

interface VehicleRow {
  id: string;
  clientId: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  createdAt: Date;
  updatedAt: Date;
}

export class VehiclePersistenceMapper {
  static toPersistence(vehicle: Vehicle): VehicleRow {
    return {
      id: vehicle.getId(),
      clientId: vehicle.getClientId(),
      plate: vehicle.getPlate().getValue(),
      brand: vehicle.getBrand(),
      model: vehicle.getModel(),
      year: vehicle.getYear().getValue(),
      createdAt: vehicle.getCreatedAt(),
      updatedAt: vehicle.getUpdatedAt(),
    };
  }

  /** Placa e dono são imutáveis, então nunca entram no update. */
  static toUpdate(vehicle: Vehicle) {
    return {
      brand: vehicle.getBrand(),
      model: vehicle.getModel(),
      year: vehicle.getYear().getValue(),
      updatedAt: vehicle.getUpdatedAt(),
    };
  }

  static toDomain(row: VehicleRow): Vehicle {
    return Vehicle.restore(row.id, {
      clientId: row.clientId,
      plate: row.plate,
      brand: row.brand,
      model: row.model,
      year: row.year,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}

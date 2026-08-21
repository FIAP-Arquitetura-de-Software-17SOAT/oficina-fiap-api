import { VehicleResponseDto } from '../dto/vehicle.dto';
import { Vehicle } from '../entities/vehicle.entity';

/**
 * Desembrulha os Value Objects na fronteira HTTP. Sem esse passo a entidade
 * serializaria `{ "plate": { "value": "..." } }` e o contrato do Swagger
 * deixaria de bater com a resposta real.
 */
export class VehicleMapper {
  static toResponse(vehicle: Vehicle): VehicleResponseDto {
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

  static toResponseList(vehicles: Vehicle[]): VehicleResponseDto[] {
    return vehicles.map((vehicle) => VehicleMapper.toResponse(vehicle));
  }
}

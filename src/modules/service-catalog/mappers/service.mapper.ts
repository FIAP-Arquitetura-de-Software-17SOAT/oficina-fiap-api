import { ServiceResponseDto } from '../dto/service.dto';
import { Service } from '../entities/service.entity';

/**
 * Desembrulha o Money na fronteira HTTP: sem isso o preço sairia como
 * `{ "cents": 14990 }` e o contrato do Swagger deixaria de bater com a
 * resposta real.
 */
export class ServiceMapper {
  static toResponse(service: Service): ServiceResponseDto {
    return {
      id: service.getId(),
      name: service.getName(),
      description: service.getDescription() ?? null,
      price: service.getPrice().value,
      createdAt: service.getCreatedAt(),
      updatedAt: service.getUpdatedAt(),
    };
  }

  static toResponseList(services: Service[]): ServiceResponseDto[] {
    return services.map((service) => ServiceMapper.toResponse(service));
  }
}

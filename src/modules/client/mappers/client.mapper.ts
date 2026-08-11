import { ClientResponseDto } from '../dto/client.dto';
import { Client } from '../entities/client.entity';

/**
 * Desembrulha os Value Objects na fronteira HTTP. Sem esse passo a entidade
 * serializaria `{ "email": { "value": "..." } }` e o contrato do Swagger
 * deixaria de bater com a resposta real.
 */
export class ClientMapper {
  static toResponse(client: Client): ClientResponseDto {
    return {
      id: client.getId(),
      name: client.getName(),
      document: client.getDocument().getValue(),
      email: client.getEmail().getValue(),
      phone: client.getPhone(),
      createdAt: client.getCreatedAt(),
      updatedAt: client.getUpdatedAt(),
    };
  }

  static toResponseList(clients: Client[]): ClientResponseDto[] {
    return clients.map((client) => ClientMapper.toResponse(client));
  }
}

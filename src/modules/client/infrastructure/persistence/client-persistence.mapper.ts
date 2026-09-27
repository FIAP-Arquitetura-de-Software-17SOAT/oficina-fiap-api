import { Client } from '../../domain/entities/client.entity';

interface ClientRow {
  id: string;
  name: string;
  document: string;
  email: string;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
}

export class ClientPersistenceMapper {
  static toPersistence(client: Client): ClientRow {
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

  static toUpdate(client: Client) {
    return {
      name: client.getName(),
      email: client.getEmail().getValue(),
      phone: client.getPhone(),
      updatedAt: client.getUpdatedAt(),
    };
  }

  static toDomain(row: ClientRow): Client {
    return Client.restore(row.id, {
      name: row.name,
      document: row.document,
      email: row.email,
      phone: row.phone,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}

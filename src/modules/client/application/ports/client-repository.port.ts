import { Client } from '../../domain/entities/client.entity';

export abstract class ClientRepositoryPort {
  abstract create(client: Client): Promise<Client>;
  abstract findById(id: string): Promise<Client | null>;
  abstract findByDocument(document: string): Promise<Client | null>;
  abstract findByEmail(email: string): Promise<Client | null>;
  abstract findAll(): Promise<Client[]>;
  abstract update(client: Client): Promise<Client>;
  abstract delete(id: string): Promise<void>;
}

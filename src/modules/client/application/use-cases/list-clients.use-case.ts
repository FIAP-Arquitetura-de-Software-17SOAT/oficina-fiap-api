import { Client } from '../../domain/entities/client.entity';
import { ClientRepositoryPort } from '../ports/client-repository.port';

export class ListClientsUseCase {
  constructor(private readonly clients: ClientRepositoryPort) {}

  execute(): Promise<Client[]> {
    return this.clients.findAll();
  }
}

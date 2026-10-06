import { Client } from '../../domain/entities/client.entity';
import { ClientApplicationError } from '../errors/client-application.error';
import { ClientRepositoryPort } from '../ports/client-repository.port';

export class FindClientUseCase {
  constructor(private readonly clients: ClientRepositoryPort) {}

  async execute(id: string): Promise<Client> {
    const client = await this.clients.findById(id);
    if (!client) throw new ClientApplicationError('CLIENT_NOT_FOUND');
    return client;
  }
}

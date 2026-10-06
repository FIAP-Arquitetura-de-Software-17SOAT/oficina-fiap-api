import { ClientRepositoryPort } from '../ports/client-repository.port';
import { FindClientUseCase } from './find-client.use-case';

export class DeleteClientUseCase {
  constructor(private readonly clients: ClientRepositoryPort) {}

  async execute(id: string): Promise<void> {
    await new FindClientUseCase(this.clients).execute(id);
    await this.clients.delete(id);
  }
}

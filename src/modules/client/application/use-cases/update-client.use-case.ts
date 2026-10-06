import { Client } from '../../domain/entities/client.entity';
import { Email } from '../../domain/value-objects/email.vo';
import { UpdateClientInput } from '../contracts/client.input';
import { ClientApplicationError } from '../errors/client-application.error';
import { ClientRepositoryPort } from '../ports/client-repository.port';
import { FindClientUseCase } from './find-client.use-case';

export class UpdateClientUseCase {
  constructor(private readonly clients: ClientRepositoryPort) {}

  async execute(id: string, input: UpdateClientInput): Promise<Client> {
    const client = await new FindClientUseCase(this.clients).execute(id);

    if (input.email) {
      const existing = await this.clients.findByEmail(
        Email.create(input.email).getValue(),
      );
      if (existing && existing.getId() !== id) {
        throw new ClientApplicationError('CLIENT_EMAIL_IN_USE');
      }
      client.changeEmail(input.email);
    }
    if (input.name) client.changeName(input.name);
    if (input.phone) client.changePhone(input.phone);

    return this.clients.update(client);
  }
}

import { Client } from '../../domain/entities/client.entity';
import { Document } from '../../domain/value-objects/document.vo';
import { Email } from '../../domain/value-objects/email.vo';
import { CreateClientInput } from '../contracts/client.input';
import { ClientApplicationError } from '../errors/client-application.error';
import { ClientRepositoryPort } from '../ports/client-repository.port';

export class CreateClientUseCase {
  constructor(private readonly clients: ClientRepositoryPort) {}

  async execute(input: CreateClientInput): Promise<Client> {
    const document = Document.create(input.document);
    const email = Email.create(input.email);

    if (await this.clients.findByDocument(document.getValue())) {
      throw new ClientApplicationError('CLIENT_ALREADY_EXISTS');
    }
    if (await this.clients.findByEmail(email.getValue())) {
      throw new ClientApplicationError('CLIENT_EMAIL_IN_USE');
    }

    return this.clients.create(
      Client.create({
        ...input,
        document: document.getValue(),
        email: email.getValue(),
      }),
    );
  }
}

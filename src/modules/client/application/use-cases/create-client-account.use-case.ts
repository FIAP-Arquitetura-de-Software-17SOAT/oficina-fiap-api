import { ClientAccountResult } from '../contracts/client-account.result';
import { CreateClientAccountInput } from '../contracts/client.input';
import { ClientApplicationError } from '../errors/client-application.error';
import { ClientIdentityPort } from '../ports/client-identity.port';
import { ClientRepositoryPort } from '../ports/client-repository.port';
import { FindClientUseCase } from './find-client.use-case';

export class CreateClientAccountUseCase {
  constructor(
    private readonly clients: ClientRepositoryPort,
    private readonly identity: ClientIdentityPort,
  ) {}

  async execute(
    clientId: string,
    input: CreateClientAccountInput,
  ): Promise<ClientAccountResult> {
    const client = await new FindClientUseCase(this.clients).execute(clientId);
    if (await this.identity.findByClientId(clientId)) {
      throw new ClientApplicationError('CLIENT_ACCOUNT_EXISTS');
    }
    const email = client.getEmail().getValue();
    if (await this.identity.findByEmail(email)) {
      throw new ClientApplicationError('CLIENT_ACCOUNT_EMAIL_IN_USE');
    }
    return this.identity.createCustomer({
      clientId,
      email,
      password: input.password,
    });
  }
}

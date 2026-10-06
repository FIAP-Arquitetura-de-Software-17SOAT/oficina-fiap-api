import { Injectable } from '@nestjs/common';
import { ClientApplicationError } from '../../../client/application/errors/client-application.error';
import { FindClientUseCase } from '../../../client/application/use-cases/find-client.use-case';
import { ClientLookupPort } from '../../application/ports/client-lookup.port';

@Injectable()
export class ClientLookupAdapter implements ClientLookupPort {
  constructor(private readonly findClient: FindClientUseCase) {}

  async exists(clientId: string): Promise<boolean> {
    try {
      await this.findClient.execute(clientId);
      return true;
    } catch (error) {
      if (
        error instanceof ClientApplicationError &&
        error.code === 'CLIENT_NOT_FOUND'
      ) {
        return false;
      }
      throw error;
    }
  }
}

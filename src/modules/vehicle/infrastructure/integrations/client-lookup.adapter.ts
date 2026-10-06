import { Injectable } from '@nestjs/common';
import { ClientApplicationError } from '../../../client/application/errors/client-application.error';
import { FindClientUseCase } from '../../../client/application/use-cases/find-client.use-case';
import { ClientLookupPort } from '../../application/ports/client-lookup.port';

/**
 * Único arquivo do módulo que conhece o módulo de clientes. Traduz o
 * resultado esperado (cliente não encontrado) para o contrato da porta;
 * qualquer outro erro do fornecedor sobe intacto.
 */
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

import { ClientAccountResult } from '../contracts/client-account.result';

export interface CreateCustomerIdentityInput {
  clientId: string;
  email: string;
  password: string;
}

export abstract class ClientIdentityPort {
  abstract findByClientId(clientId: string): Promise<{ id: string } | null>;
  abstract findByEmail(email: string): Promise<{ id: string } | null>;
  abstract createCustomer(
    input: CreateCustomerIdentityInput,
  ): Promise<ClientAccountResult>;
}

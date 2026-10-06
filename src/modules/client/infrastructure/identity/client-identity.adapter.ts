import { Injectable } from '@nestjs/common';
import { PasswordHasherPort } from '../../../../shared/identity/application/ports/password-hasher.port';
import { UserRepositoryPort } from '../../../../shared/identity/application/ports/user-repository.port';
import { User } from '../../../../shared/identity/domain/entities/user.entity';
import { ClientAccountResult } from '../../application/contracts/client-account.result';
import {
  ClientIdentityPort,
  CreateCustomerIdentityInput,
} from '../../application/ports/client-identity.port';

@Injectable()
export class ClientIdentityAdapter implements ClientIdentityPort {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly passwords: PasswordHasherPort,
  ) {}

  async findByClientId(clientId: string): Promise<{ id: string } | null> {
    const user = await this.users.findByClientId(clientId);
    return user ? { id: user.getId() } : null;
  }

  async findByEmail(email: string): Promise<{ id: string } | null> {
    const user = await this.users.findByEmail(email);
    return user ? { id: user.getId() } : null;
  }

  async createCustomer(
    input: CreateCustomerIdentityInput,
  ): Promise<ClientAccountResult> {
    const user = await this.users.create(
      User.createCustomer({
        email: input.email,
        clientId: input.clientId,
        passwordHash: await this.passwords.hash(input.password),
      }),
    );
    return {
      id: user.getId(),
      email: user.getEmail(),
      role: 'CUSTOMER',
      clientId: input.clientId,
      createdAt: user.getCreatedAt(),
    };
  }
}

import { Injectable } from '@nestjs/common';
import { User } from '../../../../shared/identity/entities/user.entity';
import { UserRepository } from '../../../../shared/identity/repositories/user.repository';
import { PasswordHashService } from '../../../../shared/identity/services/password-hash.service';
import { ClientAccountResult } from '../../application/contracts/client-account.result';
import {
  ClientIdentityPort,
  CreateCustomerIdentityInput,
} from '../../application/ports/client-identity.port';

@Injectable()
export class ClientIdentityAdapter implements ClientIdentityPort {
  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordHashService,
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

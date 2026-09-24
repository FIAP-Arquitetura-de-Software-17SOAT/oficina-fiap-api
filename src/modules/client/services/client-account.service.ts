import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User } from '../../../shared/identity/entities/user.entity';
import { normalizeLoginEmail } from '../../../shared/identity/login-credentials';
import { UserRepository } from '../../../shared/identity/repositories/user.repository';
import { PasswordHashService } from '../../../shared/identity/services/password-hash.service';
import { CreateClientAccountDto } from '../dto/client-account.dto';
import { ClientRepository } from '../repositories/client.repository';

/**
 * Login do cliente (papel CUSTOMER). Quem cria é a oficina, no balcão: o email
 * do login é o do cadastro do cliente, e a senha é a que ele escolher.
 */
@Injectable()
export class ClientAccountService {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly users: UserRepository,
    private readonly passwordHash: PasswordHashService,
  ) {}

  async createAccount(
    clientId: string,
    dto: CreateClientAccountDto,
  ): Promise<User> {
    const client = await this.clientRepository.findById(clientId);

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    if (await this.users.findByClientId(clientId)) {
      throw new ConflictException('Client already has an account');
    }

    const email = normalizeLoginEmail(client.getEmail().getValue());

    if (await this.users.findByEmail(email)) {
      throw new ConflictException('E-mail already used by another account');
    }

    return this.users.create(
      User.createCustomer({
        email,
        passwordHash: await this.passwordHash.hash(dto.password),
        clientId,
      }),
    );
  }
}

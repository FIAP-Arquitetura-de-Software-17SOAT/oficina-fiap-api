import { User } from '../../domain/entities/user.entity';

export abstract class UserRepositoryPort {
  abstract findByEmail(email: string): Promise<User | null>;
  abstract findById(id: string): Promise<User | null>;
  /** O login do cliente é um por cliente. */
  abstract findByClientId(clientId: string): Promise<User | null>;
  abstract create(user: User): Promise<User>;
}

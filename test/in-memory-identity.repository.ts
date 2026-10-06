import { RefreshSessionRepositoryPort } from '../src/shared/identity/application/ports/refresh-session-repository.port';
import { UserRepositoryPort } from '../src/shared/identity/application/ports/user-repository.port';
import { RefreshSession } from '../src/shared/identity/domain/entities/refresh-session.entity';
import { User } from '../src/shared/identity/domain/entities/user.entity';

export class InMemoryUserRepository implements UserRepositoryPort {
  private users: User[] = [];

  reset(users: User[]): void {
    this.users = [...users];
  }

  findByEmail(email: string): Promise<User | null> {
    return Promise.resolve(
      this.users.find((user) => user.getEmail() === email) ?? null,
    );
  }

  findById(id: string): Promise<User | null> {
    return Promise.resolve(
      this.users.find((user) => user.getId() === id) ?? null,
    );
  }

  findByClientId(clientId: string): Promise<User | null> {
    return Promise.resolve(
      this.users.find((user) => user.getClientId() === clientId) ?? null,
    );
  }

  create(user: User): Promise<User> {
    this.users.push(user);
    return Promise.resolve(user);
  }
}

export class InMemoryRefreshSessionRepository implements RefreshSessionRepositoryPort {
  readonly sessions = new Map<string, RefreshSession>();

  reset(): void {
    this.sessions.clear();
  }

  create(session: RefreshSession): Promise<RefreshSession> {
    this.sessions.set(session.getJti(), session);
    return Promise.resolve(session);
  }

  findByJti(jti: string): Promise<RefreshSession | null> {
    return Promise.resolve(this.sessions.get(jti) ?? null);
  }

  revoke(jti: string, revokedAt: Date): Promise<void> {
    this.sessions.get(jti)?.revoke(revokedAt);
    return Promise.resolve();
  }

  rotate(
    consumedJti: string,
    revokedAt: Date,
    replacement: RefreshSession,
  ): Promise<boolean> {
    const consumed = this.sessions.get(consumedJti);
    if (!consumed || consumed.isRevoked() || consumed.isExpired(revokedAt)) {
      return Promise.resolve(false);
    }
    consumed.revoke(revokedAt);
    this.sessions.set(replacement.getJti(), replacement);
    return Promise.resolve(true);
  }
}

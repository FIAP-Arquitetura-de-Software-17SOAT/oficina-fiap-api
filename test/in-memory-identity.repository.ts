import { RefreshSession } from '../src/shared/identity/entities/refresh-session.entity';
import { User } from '../src/shared/identity/entities/user.entity';

export class InMemoryUserRepository {
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
}

export class InMemoryRefreshSessionRepository {
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
}

export class InMemoryIdentityPrisma {
  constructor(private readonly sessions: Map<string, RefreshSession>) {}

  readonly refreshSession = {
    updateMany: (args: {
      where: {
        jti: string;
        revokedAt: null;
        expiresAt: { gt: Date };
      };
      data: { revokedAt: Date };
    }): Promise<{ count: number }> => {
      const session = this.sessions.get(args.where.jti);

      if (
        !session ||
        session.isRevoked() ||
        session.isExpired(args.where.expiresAt.gt)
      ) {
        return Promise.resolve({ count: 0 });
      }

      session.revoke(args.data.revokedAt);
      return Promise.resolve({ count: 1 });
    },
    create: (args: {
      data: {
        id: string;
        jti: string;
        tokenHash: string;
        expiresAt: Date;
        revokedAt: Date | null;
        userId: string;
        createdAt: Date;
        updatedAt: Date;
      };
    }): Promise<void> => {
      const data = args.data;

      this.sessions.set(
        data.jti,
        RefreshSession.restore(data.id, {
          jti: data.jti,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          revokedAt: data.revokedAt,
          userId: data.userId,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        }),
      );
      return Promise.resolve();
    },
  };

  $transaction<T>(operation: (prisma: this) => Promise<T>): Promise<T> {
    return operation(this);
  }
}

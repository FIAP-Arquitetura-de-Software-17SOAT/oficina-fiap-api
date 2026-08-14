import { randomUUID } from 'crypto';

export interface RefreshSessionProps {
  jti: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  userId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class RefreshSession {
  private revokedAt: Date | null;
  private updatedAt: Date;

  private constructor(
    private readonly id: string,
    private readonly jti: string,
    private readonly tokenHash: string,
    private readonly expiresAt: Date,
    revokedAt: Date | null,
    private readonly userId: string,
    private readonly createdAt: Date,
    updatedAt: Date,
  ) {
    this.revokedAt = revokedAt;
    this.updatedAt = updatedAt;
  }

  static create(props: RefreshSessionProps): RefreshSession {
    const now = new Date();

    return new RefreshSession(
      randomUUID(),
      props.jti,
      props.tokenHash,
      props.expiresAt,
      props.revokedAt ?? null,
      props.userId,
      props.createdAt ?? now,
      props.updatedAt ?? now,
    );
  }

  static restore(
    id: string,
    props: Required<Omit<RefreshSessionProps, 'revokedAt'>> & {
      revokedAt: Date | null;
    },
  ): RefreshSession {
    return new RefreshSession(
      id,
      props.jti,
      props.tokenHash,
      props.expiresAt,
      props.revokedAt,
      props.userId,
      props.createdAt,
      props.updatedAt,
    );
  }

  getId(): string {
    return this.id;
  }

  getJti(): string {
    return this.jti;
  }

  getTokenHash(): string {
    return this.tokenHash;
  }

  getExpiresAt(): Date {
    return this.expiresAt;
  }

  getRevokedAt(): Date | null {
    return this.revokedAt;
  }

  getUserId(): string {
    return this.userId;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  isRevoked(): boolean {
    return this.revokedAt !== null;
  }

  isExpired(now = new Date()): boolean {
    return this.expiresAt.getTime() <= now.getTime();
  }

  revoke(revokedAt = new Date()): void {
    this.revokedAt = revokedAt;
    this.updatedAt = revokedAt;
  }
}

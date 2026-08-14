import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RefreshSession } from '../entities/refresh-session.entity';

interface RefreshSessionRow {
  id: string;
  jti: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class RefreshSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(session: RefreshSession): Promise<RefreshSession> {
    const row = await this.prisma.refreshSession.create({
      data: this.toPersistence(session),
    });

    return this.toDomain(row);
  }

  async findByJti(jti: string): Promise<RefreshSession | null> {
    const row = await this.prisma.refreshSession.findUnique({ where: { jti } });

    return row ? this.toDomain(row) : null;
  }

  async revoke(jti: string, revokedAt: Date): Promise<void> {
    await this.prisma.refreshSession.update({
      where: { jti },
      data: { revokedAt },
    });
  }

  private toPersistence(session: RefreshSession) {
    return {
      id: session.getId(),
      jti: session.getJti(),
      tokenHash: session.getTokenHash(),
      expiresAt: session.getExpiresAt(),
      revokedAt: session.getRevokedAt(),
      userId: session.getUserId(),
      createdAt: session.getCreatedAt(),
      updatedAt: session.getUpdatedAt(),
    };
  }

  private toDomain(row: RefreshSessionRow): RefreshSession {
    return RefreshSession.restore(row.id, {
      jti: row.jti,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      userId: row.userId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}

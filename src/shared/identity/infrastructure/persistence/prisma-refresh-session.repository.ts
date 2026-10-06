import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { RefreshSessionRepositoryPort } from '../../application/ports/refresh-session-repository.port';
import { RefreshSession } from '../../domain/entities/refresh-session.entity';

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
export class PrismaRefreshSessionRepository implements RefreshSessionRepositoryPort {
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

  async rotate(
    consumedJti: string,
    revokedAt: Date,
    replacement: RefreshSession,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // Só revoga o que ainda está vivo: revogada ou vencida, a sessão
      // consumida não rende outra.
      const result = await tx.refreshSession.updateMany({
        where: {
          jti: consumedJti,
          revokedAt: null,
          expiresAt: { gt: revokedAt },
        },
        data: { revokedAt },
      });
      if (result.count !== 1) return false;

      await tx.refreshSession.create({
        data: this.toPersistence(replacement),
      });
      return true;
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

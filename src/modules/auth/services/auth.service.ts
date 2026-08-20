import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/database/prisma.service';
import { RefreshSession } from '../../../shared/identity/entities/refresh-session.entity';
import { User, UserRole } from '../../../shared/identity/entities/user.entity';
import { RefreshSessionRepository } from '../../../shared/identity/repositories/refresh-session.repository';
import { UserRepository } from '../../../shared/identity/repositories/user.repository';
import { PasswordHashService } from '../../../shared/identity/services/password-hash.service';
import { LoginDto, TokenPairDto } from '../dto/auth.dto';

type JwtTtl = Exclude<SignOptions['expiresIn'], number | undefined>;

export interface AuthTokenPayload {
  sub: string;
  role: UserRole;
  type: 'access' | 'refresh';
  jti: string;
  iat: number;
  exp: number;
}

interface TokenClaims {
  sub: string;
  role: UserRole;
  type: 'access' | 'refresh';
  jti: string;
}

export interface JwtSettings {
  accessSecret: string;
  accessTtl: JwtTtl;
  refreshSecret: string;
  refreshTtl: JwtTtl;
}

const TTL_PATTERN = /^([1-9]\d*)(ms|s|m|h|d|w|y)$/;
const MIN_PRODUCTION_SECRET_BYTES = 32;
const LEGACY_SECRET_PLACEHOLDERS = new Set([
  'change-me-access-secret',
  'change-me-refresh-secret',
]);
const TTL_MULTIPLIERS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
  y: 31_557_600_000,
};

function requiredSetting(config: ConfigService, key: string): string {
  const value = config.get<string>(key)?.trim();

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

function assertProductionSecret(
  config: ConfigService,
  key: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET',
  value: string,
): void {
  if (config.get<string>('NODE_ENV') !== 'production') {
    return;
  }

  if (LEGACY_SECRET_PLACEHOLDERS.has(value)) {
    throw new Error(`${key} must not use a known placeholder in production`);
  }

  if (Buffer.byteLength(value, 'utf8') < MIN_PRODUCTION_SECRET_BYTES) {
    throw new Error(
      `${key} must be at least ${MIN_PRODUCTION_SECRET_BYTES} UTF-8 bytes in production`,
    );
  }
}

function readTtl(config: ConfigService, key: string): JwtTtl {
  const value = requiredSetting(config, key);
  const match = TTL_PATTERN.exec(value);

  if (!match) {
    throw new Error(`${key} must be a positive whole-second JWT duration`);
  }

  const durationValue = Number(match[1]);
  const durationMilliseconds = durationValue * TTL_MULTIPLIERS[match[2]];
  const expiryDate = new Date(Date.now() + durationMilliseconds);

  if (
    !Number.isSafeInteger(durationValue) ||
    !Number.isSafeInteger(durationMilliseconds) ||
    durationMilliseconds < 1_000 ||
    durationMilliseconds % 1_000 !== 0 ||
    !Number.isFinite(expiryDate.getTime())
  ) {
    throw new Error(`${key} must be a positive whole-second JWT duration`);
  }

  return value as JwtTtl;
}

export function readJwtSettings(config: ConfigService): JwtSettings {
  const accessSecret = requiredSetting(config, 'JWT_ACCESS_SECRET');
  const refreshSecret = requiredSetting(config, 'JWT_REFRESH_SECRET');

  assertProductionSecret(config, 'JWT_ACCESS_SECRET', accessSecret);
  assertProductionSecret(config, 'JWT_REFRESH_SECRET', refreshSecret);

  if (accessSecret === refreshSecret) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
  }

  return {
    accessSecret,
    accessTtl: readTtl(config, 'JWT_ACCESS_TTL'),
    refreshSecret,
    refreshTtl: readTtl(config, 'JWT_REFRESH_TTL'),
  };
}

@Injectable()
export class AuthService {
  private readonly jwtSettings: JwtSettings;

  constructor(
    private readonly users: UserRepository,
    private readonly refreshSessions: RefreshSessionRepository,
    private readonly passwordHash: PasswordHashService,
    private readonly jwt: JwtService,
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.jwtSettings = readJwtSettings(config);
  }

  async login(dto: LoginDto): Promise<TokenPairDto> {
    const user = await this.users.findByEmail(dto.email);

    if (
      !user ||
      !(await this.passwordHash.compare(dto.password, user.getPasswordHash()))
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const issued = await this.issueTokens(user);
    await this.refreshSessions.create(issued.session);

    return issued.tokens;
  }

  async refresh(token: string): Promise<TokenPairDto> {
    const consumedPayload = await this.verifyRefreshToken(token);
    const consumedSession = await this.refreshSessions.findByJti(
      consumedPayload.jti,
    );

    if (
      !consumedSession ||
      consumedSession.getUserId() !== consumedPayload.sub ||
      consumedSession.isRevoked() ||
      consumedSession.isExpired() ||
      !(await this.passwordHash.compare(
        this.refreshTokenDigest(token),
        consumedSession.getTokenHash(),
      ))
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.users.findById(consumedPayload.sub);

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const issued = await this.issueTokens(user);
    const revokedAt = new Date();

    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.refreshSession.updateMany({
        where: {
          jti: consumedPayload.jti,
          revokedAt: null,
          expiresAt: { gt: revokedAt },
        },
        data: { revokedAt },
      });

      if (result.count !== 1) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      await transaction.refreshSession.create({
        data: this.toPersistence(issued.session),
      });
    });

    return issued.tokens;
  }

  async logout(token: string): Promise<void> {
    const payload = await this.verifyRefreshToken(token);
    const session = await this.refreshSessions.findByJti(payload.jti);

    if (
      !session ||
      session.getUserId() !== payload.sub ||
      !(await this.passwordHash.compare(
        this.refreshTokenDigest(token),
        session.getTokenHash(),
      ))
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!session.isRevoked()) {
      await this.refreshSessions.revoke(payload.jti, new Date());
    }
  }

  private async issueTokens(user: User): Promise<{
    tokens: TokenPairDto;
    session: RefreshSession;
  }> {
    const accessToken = await this.jwt.signAsync(
      this.createClaims(user, 'access'),
      {
        secret: this.jwtSettings.accessSecret,
        expiresIn: this.jwtSettings.accessTtl,
      },
    );
    const refreshToken = await this.jwt.signAsync(
      this.createClaims(user, 'refresh'),
      {
        secret: this.jwtSettings.refreshSecret,
        expiresIn: this.jwtSettings.refreshTtl,
      },
    );
    const refreshPayload = await this.verifyRefreshToken(refreshToken);

    return {
      tokens: { accessToken, refreshToken },
      session: RefreshSession.create({
        jti: refreshPayload.jti,
        tokenHash: await this.passwordHash.hash(
          this.refreshTokenDigest(refreshToken),
        ),
        expiresAt: new Date(refreshPayload.exp * 1000),
        userId: user.getId(),
      }),
    };
  }

  private createClaims(user: User, type: 'access' | 'refresh'): TokenClaims {
    return {
      sub: user.getId(),
      role: user.getRole(),
      type,
      jti: randomUUID(),
    };
  }

  private refreshTokenDigest(token: string): string {
    return createHash('sha256').update(token).digest('base64url');
  }

  private async verifyRefreshToken(token: string): Promise<AuthTokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<AuthTokenPayload>(token, {
        secret: this.jwtSettings.refreshSecret,
      });

      if (
        payload.type !== 'refresh' ||
        !payload.sub ||
        payload.role !== 'ADMIN' ||
        !payload.jti ||
        !Number.isFinite(payload.iat) ||
        !Number.isFinite(payload.exp)
      ) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return payload;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid refresh token');
    }
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
}

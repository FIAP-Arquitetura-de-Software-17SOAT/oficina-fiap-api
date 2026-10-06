import { ConfigService } from '@nestjs/config';
import type { SignOptions } from 'jsonwebtoken';

type JwtTtl = Exclude<SignOptions['expiresIn'], number | undefined>;

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

/** Lê e valida os segredos e TTLs do JWT na subida do módulo, não no primeiro login. */
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

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Role } from '../../../../generated/prisma/enums';
import { AuthenticatedUser } from './current-user.decorator';

interface AccessTokenPayload {
  sub?: unknown;
  role?: unknown;
  clientId?: unknown;
  type?: unknown;
  jti?: unknown;
  iat?: unknown;
  exp?: unknown;
}

@Injectable()
export class AccessTokenStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const accessSecret = config.get<string>('JWT_ACCESS_SECRET')?.trim();

    if (!accessSecret) {
      throw new Error('JWT_ACCESS_SECRET is required');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: accessSecret,
    });
  }

  validate(payload: AccessTokenPayload): AuthenticatedUser {
    if (
      payload.type !== 'access' ||
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      typeof payload.role !== 'string' ||
      !payload.role ||
      typeof payload.jti !== 'string' ||
      !payload.jti ||
      !Number.isFinite(payload.iat) ||
      !Number.isFinite(payload.exp)
    ) {
      throw new UnauthorizedException('Invalid access token');
    }

    if (payload.role !== Role.CUSTOMER) {
      return { id: payload.sub, role: payload.role as Role };
    }

    // O CUSTOMER só enxerga o que é do próprio cliente; token sem cliente não
    // tem o que enxergar.
    if (typeof payload.clientId !== 'string' || !payload.clientId) {
      throw new UnauthorizedException('Invalid access token');
    }

    return {
      id: payload.sub,
      role: Role.CUSTOMER,
      clientId: payload.clientId,
    };
  }
}

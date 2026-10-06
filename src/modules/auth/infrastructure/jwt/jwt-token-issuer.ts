import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  AuthTokenPayload,
  TokenClaims,
  TokenIssuerPort,
} from '../../application/ports/token-issuer.port';
import { JwtSettings, readJwtSettings } from './jwt-settings';

/** Access e refresh têm segredo e TTL próprios: um token nunca serve no lugar do outro. */
@Injectable()
export class JwtTokenIssuer implements TokenIssuerPort {
  private readonly settings: JwtSettings;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.settings = readJwtSettings(config);
  }

  sign(claims: TokenClaims): Promise<string> {
    const access = claims.type === 'access';

    return this.jwt.signAsync(claims, {
      secret: access ? this.settings.accessSecret : this.settings.refreshSecret,
      expiresIn: access ? this.settings.accessTtl : this.settings.refreshTtl,
    });
  }

  async verifyRefresh(token: string): Promise<AuthTokenPayload | null> {
    try {
      return await this.jwt.verifyAsync<AuthTokenPayload>(token, {
        secret: this.settings.refreshSecret,
      });
    } catch {
      return null;
    }
  }
}

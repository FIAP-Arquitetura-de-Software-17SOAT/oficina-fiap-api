import { createHash, randomUUID } from 'crypto';
import { PasswordHasherPort } from '../../../../shared/identity/application/ports/password-hasher.port';
import { RefreshSession } from '../../../../shared/identity/domain/entities/refresh-session.entity';
import { User } from '../../../../shared/identity/domain/entities/user.entity';
import { TokenPair } from '../contracts/auth.input';
import { AuthApplicationError } from '../errors/auth-application.error';
import {
  AuthTokenPayload,
  TokenClaims,
  TokenIssuerPort,
  TokenType,
} from '../ports/token-issuer.port';

// Antes só ADMIN renovava o token, de quando ele era o único papel: o EMPLOYEE
// perdia a sessão ao fim do access token. Todo papel conhecido renova.
const USER_ROLES: readonly string[] = ['ADMIN', 'EMPLOYEE', 'CUSTOMER'];

export interface IssuedTokens {
  tokens: TokenPair;
  /** A sessão guarda só o hash do digest do refresh token, nunca o token. */
  session: RefreshSession;
}

/**
 * O que login, refresh e logout têm em comum: emitir o par de tokens com a
 * sessão correspondente, ler um refresh token e conferir que ele é dono da
 * sessão gravada.
 */
export class RefreshTokenSessions {
  constructor(
    private readonly tokens: TokenIssuerPort,
    private readonly hasher: PasswordHasherPort,
  ) {}

  async issue(user: User): Promise<IssuedTokens> {
    const accessToken = await this.tokens.sign(this.claims(user, 'access'));
    const refreshToken = await this.tokens.sign(this.claims(user, 'refresh'));
    const payload = await this.verify(refreshToken);

    return {
      tokens: { accessToken, refreshToken },
      session: RefreshSession.create({
        jti: payload.jti,
        tokenHash: await this.hasher.hash(this.digest(refreshToken)),
        expiresAt: new Date(payload.exp * 1000),
        userId: user.getId(),
      }),
    };
  }

  /** Assinatura, validade e forma: qualquer falha é o mesmo 401 sem detalhe. */
  async verify(token: string): Promise<AuthTokenPayload> {
    const payload = await this.tokens.verifyRefresh(token);

    if (
      !payload ||
      payload.type !== 'refresh' ||
      !payload.sub ||
      !USER_ROLES.includes(payload.role) ||
      !payload.jti ||
      !Number.isFinite(payload.iat) ||
      !Number.isFinite(payload.exp)
    ) {
      throw new AuthApplicationError('INVALID_REFRESH_TOKEN');
    }

    return payload;
  }

  /**
   * O token só vale para a sessão que ele mesmo abriu: mesmo `jti`, mesmo
   * usuário e o hash gravado bate com o digest deste token.
   */
  async owns(
    session: RefreshSession,
    payload: AuthTokenPayload,
    token: string,
  ): Promise<boolean> {
    return (
      session.getUserId() === payload.sub &&
      (await this.hasher.compare(this.digest(token), session.getTokenHash()))
    );
  }

  private claims(user: User, type: TokenType): TokenClaims {
    const clientId = user.getClientId();

    return {
      sub: user.getId(),
      role: user.getRole(),
      ...(clientId ? { clientId } : {}),
      type,
      jti: randomUUID(),
    };
  }

  /** O bcrypt corta em 72 bytes; o JWT passa disso, então o hash é do digest. */
  private digest(token: string): string {
    return createHash('sha256').update(token).digest('base64url');
  }
}

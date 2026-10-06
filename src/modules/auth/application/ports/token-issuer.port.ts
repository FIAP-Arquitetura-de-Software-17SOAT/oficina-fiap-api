import { UserRole } from '../../../../shared/identity/domain/entities/user.entity';

export type TokenType = 'access' | 'refresh';

export interface TokenClaims {
  sub: string;
  role: UserRole;
  /** Só o CUSTOMER tem cliente; é o que recorta o que ele pode ver. */
  clientId?: string;
  type: TokenType;
  jti: string;
}

/** Claims de volta do token, com o que o assinador acrescenta. */
export interface AuthTokenPayload extends TokenClaims {
  iat: number;
  exp: number;
}

/**
 * Assina e verifica os tokens. Segredos e TTLs são infraestrutura: o caso de
 * uso só diz "emite um access" ou "emite um refresh".
 */
export abstract class TokenIssuerPort {
  abstract sign(claims: TokenClaims): Promise<string>;
  /** `null` quando a assinatura não bate ou o token venceu. */
  abstract verifyRefresh(token: string): Promise<AuthTokenPayload | null>;
}

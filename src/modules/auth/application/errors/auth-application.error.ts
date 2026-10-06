import { ApplicationError } from '../../../../shared/application/application.error';

export type AuthErrorCode = 'INVALID_CREDENTIALS' | 'INVALID_REFRESH_TOKEN';

const messages: Record<AuthErrorCode, string> = {
  INVALID_CREDENTIALS: 'Invalid credentials',
  INVALID_REFRESH_TOKEN: 'Invalid refresh token',
};

/**
 * Os dois erros são `UNAUTHORIZED` e dizem o mínimo: quem tenta adivinhar
 * senha ou token não ganha pista do que acertou.
 */
export class AuthApplicationError extends ApplicationError {
  declare readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode) {
    super(code, 'UNAUTHORIZED', messages[code]);
  }
}

import { RefreshSessionRepositoryPort } from '../../../../shared/identity/application/ports/refresh-session-repository.port';
import { UserRepositoryPort } from '../../../../shared/identity/application/ports/user-repository.port';
import { TokenPair } from '../contracts/auth.input';
import { AuthApplicationError } from '../errors/auth-application.error';
import { RefreshTokenSessions } from '../services/refresh-token-sessions';

/**
 * Rotação: o refresh token consumido morre e nasce outro par. A troca é
 * atômica na porta; dois pedidos com o mesmo token rendem uma sessão só.
 */
export class RefreshTokensUseCase {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly sessions: RefreshSessionRepositoryPort,
    private readonly refreshTokens: RefreshTokenSessions,
  ) {}

  async execute(token: string): Promise<TokenPair> {
    const payload = await this.refreshTokens.verify(token);
    const consumed = await this.sessions.findByJti(payload.jti);

    if (
      !consumed ||
      consumed.isRevoked() ||
      consumed.isExpired() ||
      !(await this.refreshTokens.owns(consumed, payload, token))
    ) {
      throw new AuthApplicationError('INVALID_REFRESH_TOKEN');
    }

    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new AuthApplicationError('INVALID_REFRESH_TOKEN');
    }

    const issued = await this.refreshTokens.issue(user);
    const rotated = await this.sessions.rotate(
      payload.jti,
      new Date(),
      issued.session,
    );
    if (!rotated) {
      throw new AuthApplicationError('INVALID_REFRESH_TOKEN');
    }

    return issued.tokens;
  }
}

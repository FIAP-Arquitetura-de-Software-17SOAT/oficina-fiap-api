import { RefreshSessionRepositoryPort } from '../../../../shared/identity/application/ports/refresh-session-repository.port';
import { AuthApplicationError } from '../errors/auth-application.error';
import { RefreshTokenSessions } from '../services/refresh-token-sessions';

/** Revoga a sessão do token. Repetir o logout é inofensivo. */
export class LogoutUseCase {
  constructor(
    private readonly sessions: RefreshSessionRepositoryPort,
    private readonly refreshTokens: RefreshTokenSessions,
  ) {}

  async execute(token: string): Promise<void> {
    const payload = await this.refreshTokens.verify(token);
    const session = await this.sessions.findByJti(payload.jti);

    if (!session || !(await this.refreshTokens.owns(session, payload, token))) {
      throw new AuthApplicationError('INVALID_REFRESH_TOKEN');
    }

    if (!session.isRevoked()) {
      await this.sessions.revoke(payload.jti, new Date());
    }
  }
}

import { PasswordHasherPort } from '../../../../shared/identity/application/ports/password-hasher.port';
import { RefreshSessionRepositoryPort } from '../../../../shared/identity/application/ports/refresh-session-repository.port';
import { UserRepositoryPort } from '../../../../shared/identity/application/ports/user-repository.port';
import { LoginInput, TokenPair } from '../contracts/auth.input';
import { AuthApplicationError } from '../errors/auth-application.error';
import { RefreshTokenSessions } from '../services/refresh-token-sessions';

export class LoginUseCase {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly hasher: PasswordHasherPort,
    private readonly sessions: RefreshSessionRepositoryPort,
    private readonly refreshTokens: RefreshTokenSessions,
  ) {}

  async execute(input: LoginInput): Promise<TokenPair> {
    const user = await this.users.findByEmail(input.email);

    if (
      !user ||
      !(await this.hasher.compare(input.password, user.getPasswordHash()))
    ) {
      throw new AuthApplicationError('INVALID_CREDENTIALS');
    }

    const issued = await this.refreshTokens.issue(user);
    await this.sessions.create(issued.session);

    return issued.tokens;
  }
}

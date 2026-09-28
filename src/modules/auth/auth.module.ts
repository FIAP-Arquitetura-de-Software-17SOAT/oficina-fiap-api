import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PasswordHasherPort } from '../../shared/identity/application/ports/password-hasher.port';
import { RefreshSessionRepositoryPort } from '../../shared/identity/application/ports/refresh-session-repository.port';
import { UserRepositoryPort } from '../../shared/identity/application/ports/user-repository.port';
import { IdentityModule } from '../../shared/identity/identity.module';
import { AccessTokenStrategy } from '../../shared/http/auth/access-token.strategy';
import { JwtAuthGuard } from '../../shared/http/auth/jwt-auth.guard';
import { RolesGuard } from '../../shared/http/auth/roles.guard';
import { TokenIssuerPort } from './application/ports/token-issuer.port';
import { RefreshTokenSessions } from './application/services/refresh-token-sessions';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { RefreshTokensUseCase } from './application/use-cases/refresh-tokens.use-case';
import { readJwtSettings } from './infrastructure/jwt/jwt-settings';
import { JwtTokenIssuer } from './infrastructure/jwt/jwt-token-issuer';
import { AuthController } from './presentation/http/auth.controller';

/**
 * Login e sessão. Usuários, sessões e hash de senha vêm das portas do
 * `IdentityModule`; os guards e a strategy do Passport continuam em
 * `shared/http/auth`, porque protegem rotas de todos os módulos.
 */
@Module({
  imports: [
    ConfigModule,
    PassportModule,
    IdentityModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const settings = readJwtSettings(config);

        return {
          secret: settings.accessSecret,
          signOptions: { expiresIn: settings.accessTtl },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AccessTokenStrategy,
    JwtAuthGuard,
    RolesGuard,
    { provide: TokenIssuerPort, useClass: JwtTokenIssuer },
    {
      provide: RefreshTokenSessions,
      useFactory: (tokens: TokenIssuerPort, hasher: PasswordHasherPort) =>
        new RefreshTokenSessions(tokens, hasher),
      inject: [TokenIssuerPort, PasswordHasherPort],
    },
    {
      provide: LoginUseCase,
      useFactory: (
        users: UserRepositoryPort,
        hasher: PasswordHasherPort,
        sessions: RefreshSessionRepositoryPort,
        refreshTokens: RefreshTokenSessions,
      ) => new LoginUseCase(users, hasher, sessions, refreshTokens),
      inject: [
        UserRepositoryPort,
        PasswordHasherPort,
        RefreshSessionRepositoryPort,
        RefreshTokenSessions,
      ],
    },
    {
      provide: RefreshTokensUseCase,
      useFactory: (
        users: UserRepositoryPort,
        sessions: RefreshSessionRepositoryPort,
        refreshTokens: RefreshTokenSessions,
      ) => new RefreshTokensUseCase(users, sessions, refreshTokens),
      inject: [
        UserRepositoryPort,
        RefreshSessionRepositoryPort,
        RefreshTokenSessions,
      ],
    },
    {
      provide: LogoutUseCase,
      useFactory: (
        sessions: RefreshSessionRepositoryPort,
        refreshTokens: RefreshTokenSessions,
      ) => new LogoutUseCase(sessions, refreshTokens),
      inject: [RefreshSessionRepositoryPort, RefreshTokenSessions],
    },
  ],
  exports: [JwtAuthGuard, RolesGuard],
})
export class AuthModule {}

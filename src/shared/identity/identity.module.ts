import { Module } from '@nestjs/common';
import { PasswordHasherPort } from './application/ports/password-hasher.port';
import { RefreshSessionRepositoryPort } from './application/ports/refresh-session-repository.port';
import { UserRepositoryPort } from './application/ports/user-repository.port';
import { PrismaRefreshSessionRepository } from './infrastructure/persistence/prisma-refresh-session.repository';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { BcryptPasswordHasher } from './infrastructure/security/bcrypt-password-hasher';

/**
 * Identidade é compartilhada por auth (login) e client (conta do cliente), e
 * por isso mora em `shared/` com as mesmas camadas de um módulo. Quem importa
 * este módulo recebe só as portas.
 */
@Module({
  providers: [
    { provide: UserRepositoryPort, useClass: PrismaUserRepository },
    {
      provide: RefreshSessionRepositoryPort,
      useClass: PrismaRefreshSessionRepository,
    },
    { provide: PasswordHasherPort, useClass: BcryptPasswordHasher },
  ],
  exports: [
    UserRepositoryPort,
    RefreshSessionRepositoryPort,
    PasswordHasherPort,
  ],
})
export class IdentityModule {}

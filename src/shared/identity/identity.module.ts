import { Module } from '@nestjs/common';
import { RefreshSessionRepository } from './repositories/refresh-session.repository';
import { UserRepository } from './repositories/user.repository';
import { PasswordHashService } from './services/password-hash.service';

@Module({
  providers: [UserRepository, RefreshSessionRepository, PasswordHashService],
  exports: [UserRepository, RefreshSessionRepository, PasswordHashService],
})
export class IdentityModule {}

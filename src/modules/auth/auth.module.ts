import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../../shared/database/prisma.module';
import { IdentityModule } from '../../shared/identity/identity.module';
import { AccessTokenStrategy } from '../../shared/http/auth/access-token.strategy';
import { JwtAuthGuard } from '../../shared/http/auth/jwt-auth.guard';
import { RolesGuard } from '../../shared/http/auth/roles.guard';
import { AuthController } from './auth.controller';
import { AuthService, readJwtSettings } from './auth.service';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    PrismaModule,
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
  providers: [AuthService, AccessTokenStrategy, JwtAuthGuard, RolesGuard],
  exports: [JwtAuthGuard, RolesGuard],
})
export class AuthModule {}

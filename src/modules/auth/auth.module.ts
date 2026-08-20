import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../shared/database/prisma.module';
import { IdentityModule } from '../../shared/identity/identity.module';
import { AuthController } from './controllers/auth.controller';
import { AuthService, readJwtSettings } from './services/auth.service';

@Module({
  imports: [
    ConfigModule,
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
  providers: [AuthService],
})
export class AuthModule {}

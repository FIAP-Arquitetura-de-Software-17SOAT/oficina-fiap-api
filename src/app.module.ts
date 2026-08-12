import { Module, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { ClientModule } from './modules/client/client.module';
import { BudgetModule } from './modules/budget/budget.module';
import { PrismaModule } from './shared/database/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>('LOG_LEVEL') ?? 'info',
          redact: {
            paths: ['req.headers.authorization'],
            censor: '[REDACTED]',
          },
          transport:
            config.get<string>('NODE_ENV') !== 'production'
              ? { target: 'pino-pretty' }
              : undefined,
        },
        exclude: [{ method: RequestMethod.GET, path: 'api/v1/health' }],
        forRoutes: [{ method: RequestMethod.ALL, path: '{*path}' }],
      }),
    }),
    PrismaModule,
    ClientModule,
    BudgetModule,
  ],
  controllers: [AppController],
})
export class AppModule {}

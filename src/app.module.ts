import { Module, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { ClientModule } from './modules/client/client.module';
import { PurchaseOrderModule } from './modules/purchase-order/purchase-order.module';
import { BudgetModule } from './modules/budget/budget.module';
import { BillingModule } from './modules/billing/billing.module';
import { ServiceOrderModule } from './modules/service-order/service-order.module';
import { VehicleModule } from './modules/vehicle/vehicle.module';
import { AuthModule } from './modules/auth/auth.module';
import { StockModule } from './modules/stock/stock.module';
import { NotificationModule } from './modules/notification/notification.module';
import { PrismaModule } from './shared/database/prisma.module';
import { JwtAuthGuard } from './shared/http/auth/jwt-auth.guard';
import { RolesGuard } from './shared/http/auth/roles.guard';
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
    AuthModule,
    StockModule,
    NotificationModule,
    ClientModule,
    PurchaseOrderModule,
    BudgetModule,
    BillingModule,
    ServiceOrderModule,
    VehicleModule,
  ],
  controllers: [AppController],
  // Autenticação por padrão em toda a API: o PDF exige JWT nas rotas
  // administrativas, e proteger só o que lembramos de anotar é o caminho para
  // esquecer uma. Quem fica de fora se declara com @Public().
  // useExisting, e não useClass: assim os guards continuam resolvíveis pelos
  // próprios tokens, e os testes conseguem sobrescrevê-los com overrideGuard.
  providers: [
    JwtAuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { BudgetModule } from '../budget/budget.module';
import { ClientModule } from '../client/client.module';
import { NotificationModule } from '../notification/notification.module';
import { ServiceOrderModule } from '../service-order/service-order.module';
import { BillingController } from './controllers/billing.controller';
import { PaymentGateway } from './gateways/payment-gateway';
import { StripePaymentGateway } from './gateways/stripe-payment.gateway';
import { BillingRepository } from './repositories/billing.repository';
import { BillingService } from './services/billing.service';

@Module({
  imports: [
    PrismaModule,
    BudgetModule,
    ClientModule,
    NotificationModule,
    ServiceOrderModule,
  ],
  controllers: [BillingController],
  providers: [
    BillingService,
    BillingRepository,
    { provide: PaymentGateway, useClass: StripePaymentGateway },
  ],
  exports: [BillingService],
})
export class BillingModule {}

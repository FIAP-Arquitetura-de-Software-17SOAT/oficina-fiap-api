import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { BudgetModule } from '../budget/budget.module';
import { ServiceOrderModule } from '../service-order/service-order.module';
import { BillingController } from './controllers/billing.controller';
import { BillingRepository } from './repositories/billing.repository';
import { BillingService } from './services/billing.service';

@Module({
  imports: [PrismaModule, BudgetModule, ServiceOrderModule],
  controllers: [BillingController],
  providers: [BillingService, BillingRepository],
  exports: [BillingService],
})
export class BillingModule {}

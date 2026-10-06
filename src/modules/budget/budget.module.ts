import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { ClientModule } from '../client/client.module';
import { NotificationModule } from '../notification/notification.module';
import { ServiceCatalogModule } from '../service-catalog/service-catalog.module';
import { ServiceOrderModule } from '../service-order/service-order.module';
import { StockModule } from '../stock/stock.module';
import { BudgetWebhookController } from './controllers/budget-webhook.controller';
import { BudgetController } from './controllers/budget.controller';
import { BudgetRepository } from './repositories/budget.repository';
import { BudgetService } from './services/budget.service';

@Module({
  // O aceite e a recusa do orçamento movem a ordem de serviço; o estoque só é
  // consultado para conferir a peça que um item referencia. Quem lê o
  // orçamento aceito para despachar peças é o módulo parts-dispatch, que
  // importa este e não é importado por ele.
  imports: [
    PrismaModule,
    ServiceOrderModule,
    ServiceCatalogModule,
    ClientModule,
    NotificationModule,
    StockModule,
  ],
  controllers: [BudgetController, BudgetWebhookController],
  providers: [BudgetService, BudgetRepository],
  exports: [BudgetService],
})
export class BudgetModule {}

import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { ClientModule } from '../client/client.module';
import { NotificationModule } from '../notification/notification.module';
import { ServiceCatalogModule } from '../service-catalog/service-catalog.module';
import { ServiceOrderModule } from '../service-order/service-order.module';
import { StockModule } from '../stock/stock.module';
import { BudgetController } from './controllers/budget.controller';
import { BudgetRepository } from './repositories/budget.repository';
import { BudgetService } from './services/budget.service';

@Module({
  // O aceite e a recusa do orçamento movem a ordem de serviço; a OS nunca
  // consulta o orçamento de volta, então não há ciclo aqui.
  //
  // Com o estoque há: o orçamento confere a peça que o item referencia e o
  // despacho de peças lê o orçamento aceito — daí o forwardRef dos dois lados.
  imports: [
    PrismaModule,
    ServiceOrderModule,
    ServiceCatalogModule,
    ClientModule,
    NotificationModule,
    forwardRef(() => StockModule),
  ],
  controllers: [BudgetController],
  providers: [BudgetService, BudgetRepository, BudgetController],
  exports: [BudgetService, BudgetController],
})
export class BudgetModule {}

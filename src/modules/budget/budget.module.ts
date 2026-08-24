import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { ServiceOrderModule } from '../service-order/service-order.module';
import { BudgetController } from './controllers/budget.controller';
import { BudgetRepository } from './repositories/budget.repository';
import { BudgetService } from './services/budget.service';

@Module({
  // O aceite e a recusa do orçamento movem a ordem de serviço; a OS nunca
  // consulta o orçamento de volta, então não há ciclo aqui.
  imports: [PrismaModule, ServiceOrderModule],
  controllers: [BudgetController],
  providers: [BudgetService, BudgetRepository, BudgetController],
  exports: [BudgetService, BudgetController],
})
export class BudgetModule {}

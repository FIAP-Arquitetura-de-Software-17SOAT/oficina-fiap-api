import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BudgetModule } from '../budget/budget.module';
import { PurchaseOrderModule } from '../purchase-order/purchase-order.module';
import { ServiceOrderModule } from '../service-order/service-order.module';
import { PartController } from './controllers/part.controller';
import { PartRepository } from './repositories/part.repository';
import { StockMovementRepository } from './repositories/stock-movement.repository';
import { PartService } from './services/part.service';
import { PartsDispatchService } from './services/parts-dispatch.service';
import { StockMovementService } from './services/stock-movement.service';

@Module({
  imports: [
    AuthModule,
    // Orçamento: de onde saem as peças aprovadas. OS: para onde vai o status
    // depois da baixa. Pedido de compra: para onde vai a falta.
    forwardRef(() => BudgetModule),
    ServiceOrderModule,
    forwardRef(() => PurchaseOrderModule),
  ],
  controllers: [PartController],
  providers: [
    PartService,
    PartRepository,
    StockMovementService,
    StockMovementRepository,
    PartsDispatchService,
    PartController,
  ],
  exports: [PartService, StockMovementService, PartController],
})
export class StockModule {}

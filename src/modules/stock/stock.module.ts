import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BudgetModule } from '../budget/budget.module';
import { PurchaseOrderModule } from '../purchase-order/purchase-order.module';
import { PART_CATALOG } from '../service-order/ports/part-catalog.port';
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
    forwardRef(() => ServiceOrderModule),
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
    // A OS confere as peças pedidas na abertura por esta porta, sem importar o
    // PartController (ver part-catalog.port.ts).
    { provide: PART_CATALOG, useExisting: PartController },
  ],
  exports: [PartService, StockMovementService, PartController, PART_CATALOG],
})
export class StockModule {}

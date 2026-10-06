import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PART_CATALOG } from '../service-order/ports/part-catalog.port';
import { PartController } from './controllers/part.controller';
import { PartRepository } from './repositories/part.repository';
import { StockMovementRepository } from './repositories/stock-movement.repository';
import { PartService } from './services/part.service';
import { StockMovementService } from './services/stock-movement.service';

@Module({
  // O despacho de peças, que ligava o estoque a orçamento, OS e pedido de
  // compra, mora agora no módulo parts-dispatch. O estoque virou folha.
  imports: [AuthModule],
  controllers: [PartController],
  providers: [
    PartService,
    PartRepository,
    StockMovementService,
    StockMovementRepository,
    PartController,
    // A OS confere as peças pedidas na abertura por esta porta, sem importar o
    // PartController (ver part-catalog.port.ts).
    { provide: PART_CATALOG, useExisting: PartController },
  ],
  exports: [PartService, StockMovementService, PartController, PART_CATALOG],
})
export class StockModule {}

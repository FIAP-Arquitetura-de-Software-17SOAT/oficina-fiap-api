import { Module, forwardRef } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { PurchaseOrderController } from './controllers/purchase-order.controller';
import { PurchaseOrderRepository } from './repositories/purchase-order.repository';
import { PurchaseOrderService } from './services/purchase-order.service';

@Module({
  // forwardRef: o estoque abre o pedido quando falta peça e o pedido devolve a
  // peça ao estoque quando é entregue. A dependência é mútua por natureza.
  imports: [forwardRef(() => StockModule)],
  controllers: [PurchaseOrderController],
  providers: [
    PurchaseOrderRepository,
    PurchaseOrderService,
    PurchaseOrderController,
  ],
  exports: [PurchaseOrderService, PurchaseOrderController],
})
export class PurchaseOrderModule {}

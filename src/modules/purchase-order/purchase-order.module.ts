import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { PurchaseOrderController } from './controllers/purchase-order.controller';
import { PurchaseOrderRepository } from './repositories/purchase-order.repository';
import { PurchaseOrderService } from './services/purchase-order.service';

@Module({
  // O pedido devolve a peça ao estoque quando é entregue. Quem abre o pedido
  // quando falta peça é o módulo parts-dispatch, que importa este.
  imports: [StockModule],
  controllers: [PurchaseOrderController],
  providers: [PurchaseOrderRepository, PurchaseOrderService],
  exports: [PurchaseOrderService],
})
export class PurchaseOrderModule {}

import { Module } from '@nestjs/common';
import { ClientModule } from '../client/client.module';
import { NotificationModule } from '../notification/notification.module';
import { ServiceCatalogModule } from '../service-catalog/service-catalog.module';
import { StockModule } from '../stock/stock.module';
import { VehicleModule } from '../vehicle/vehicle.module';
import { ServiceOrderController } from './controllers/service-order.controller';
import { ServiceOrderRepository } from './repositories/service-order.repository';
import { ServiceOrderService } from './services/service-order.service';

@Module({
  // A abertura confere os serviços e as peças pedidos. Quem move a OS depois
  // do despacho de peças é o módulo parts-dispatch, que importa este.
  imports: [
    ClientModule,
    VehicleModule,
    NotificationModule,
    ServiceCatalogModule,
    StockModule,
  ],
  controllers: [ServiceOrderController],
  // O controller também entra em providers/exports porque é ele — e não o
  // service — a porta de entrada que os outros módulos chamam.
  providers: [
    ServiceOrderService,
    ServiceOrderRepository,
    ServiceOrderController,
  ],
  exports: [ServiceOrderService, ServiceOrderController],
})
export class ServiceOrderModule {}

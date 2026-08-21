import { Module } from '@nestjs/common';
import { ClientModule } from '../client/client.module';
import { VehicleModule } from '../vehicle/vehicle.module';
import { ServiceOrderController } from './controllers/service-order.controller';
import { ServiceOrderRepository } from './repositories/service-order.repository';
import { ServiceOrderService } from './services/service-order.service';

@Module({
  imports: [ClientModule, VehicleModule],
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

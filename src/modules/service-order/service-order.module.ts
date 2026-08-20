import { Module } from '@nestjs/common';
import { ClientModule } from '../client/client.module';
import { ServiceOrderController } from './controllers/service-order.controller';
import { ServiceOrderRepository } from './repositories/service-order.repository';
import { ServiceOrderService } from './services/service-order.service';

@Module({
  imports: [ClientModule],
  controllers: [ServiceOrderController],
  providers: [ServiceOrderService, ServiceOrderRepository],
  exports: [ServiceOrderService],
})
export class ServiceOrderModule {}

import { Module } from '@nestjs/common';
import { ServiceController } from './controllers/service.controller';
import { ServiceRepository } from './repositories/service.repository';
import { ServiceCatalogService } from './services/service-catalog.service';

@Module({
  // O controller também entra em providers/exports porque é ele a porta de
  // entrada do agregado para os outros módulos, conforme a convenção do
  // projeto — nunca o service nem o repositório.
  controllers: [ServiceController],
  providers: [ServiceController, ServiceCatalogService, ServiceRepository],
  exports: [ServiceController, ServiceCatalogService, ServiceRepository],
})
export class ServiceCatalogModule {}

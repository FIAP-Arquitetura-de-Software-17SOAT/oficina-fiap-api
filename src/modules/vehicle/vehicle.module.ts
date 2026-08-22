import { Module } from '@nestjs/common';
import { ClientModule } from '../client/client.module';
import { VehicleController } from './controllers/vehicle.controller';
import { VehicleRepository } from './repositories/vehicle.repository';
import { VehicleService } from './services/vehicle.service';

@Module({
  // ClientModule exporta o ClientService, usado para garantir que o dono do
  // veículo existe antes do cadastro.
  imports: [ClientModule],
  controllers: [VehicleController],
  providers: [VehicleService, VehicleRepository, VehicleController],
  exports: [VehicleService, VehicleController],
})
export class VehicleModule {}

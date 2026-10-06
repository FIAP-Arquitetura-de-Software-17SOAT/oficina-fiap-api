import { Module } from '@nestjs/common';
import { ClientModule } from '../client/client.module';
import { VehicleController } from './presentation/http/vehicle.controller';
import { VehicleRepositoryPort } from './application/ports/vehicle-repository.port';
import { ClientLookupPort } from './application/ports/client-lookup.port';
import { CreateVehicleUseCase } from './application/use-cases/create-vehicle.use-case';
import { FindVehicleUseCase } from './application/use-cases/find-vehicle.use-case';
import { ListVehiclesUseCase } from './application/use-cases/list-vehicles.use-case';
import { UpdateVehicleUseCase } from './application/use-cases/update-vehicle.use-case';
import { DeleteVehicleUseCase } from './application/use-cases/delete-vehicle.use-case';
import { PrismaVehicleRepository } from './infrastructure/persistence/prisma-vehicle.repository';
import { ClientLookupAdapter } from './infrastructure/integrations/client-lookup.adapter';

@Module({
  // ClientModule exporta FindClientUseCase; só o ClientLookupAdapter o usa.
  imports: [ClientModule],
  controllers: [VehicleController],
  providers: [
    { provide: VehicleRepositoryPort, useClass: PrismaVehicleRepository },
    { provide: ClientLookupPort, useClass: ClientLookupAdapter },
    ...[CreateVehicleUseCase, ListVehiclesUseCase].map((useCase) => ({
      provide: useCase,
      useFactory: (
        vehicles: VehicleRepositoryPort,
        clients: ClientLookupPort,
      ) => new useCase(vehicles, clients),
      inject: [VehicleRepositoryPort, ClientLookupPort],
    })),
    ...[FindVehicleUseCase, UpdateVehicleUseCase, DeleteVehicleUseCase].map(
      (useCase) => ({
        provide: useCase,
        useFactory: (vehicles: VehicleRepositoryPort) => new useCase(vehicles),
        inject: [VehicleRepositoryPort],
      }),
    ),
  ],
  exports: [FindVehicleUseCase],
})
export class VehicleModule {}

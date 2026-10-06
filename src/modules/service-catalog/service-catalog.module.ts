import { Module } from '@nestjs/common';
import { ServiceController } from './presentation/http/service.controller';
import { ServiceRepositoryPort } from './application/ports/service-repository.port';
import { CreateServiceUseCase } from './application/use-cases/create-service.use-case';
import { FindServiceUseCase } from './application/use-cases/find-service.use-case';
import { ListServicesUseCase } from './application/use-cases/list-services.use-case';
import { UpdateServiceUseCase } from './application/use-cases/update-service.use-case';
import { DeleteServiceUseCase } from './application/use-cases/delete-service.use-case';
import { PrismaServiceRepository } from './infrastructure/persistence/prisma-service.repository';

@Module({
  controllers: [ServiceController],
  providers: [
    { provide: ServiceRepositoryPort, useClass: PrismaServiceRepository },
    ...[
      CreateServiceUseCase,
      FindServiceUseCase,
      ListServicesUseCase,
      UpdateServiceUseCase,
      DeleteServiceUseCase,
    ].map((useCase) => ({
      provide: useCase,
      useFactory: (services: ServiceRepositoryPort) => new useCase(services),
      inject: [ServiceRepositoryPort],
    })),
  ],
  // Só o caso de uso que os outros módulos precisam: conferir que um serviço
  // do catálogo existe antes de referenciá-lo numa OS ou num orçamento.
  exports: [FindServiceUseCase],
})
export class ServiceCatalogModule {}

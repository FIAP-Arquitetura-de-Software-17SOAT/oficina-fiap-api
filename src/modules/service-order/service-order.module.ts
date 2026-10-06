import { Module } from '@nestjs/common';
import { ClientModule } from '../client/client.module';
import { NotificationModule } from '../notification/notification.module';
import { ServiceCatalogModule } from '../service-catalog/service-catalog.module';
import { StockModule } from '../stock/stock.module';
import { VehicleModule } from '../vehicle/vehicle.module';
import { ServiceOrderController } from './presentation/http/service-order.controller';
import { ClientLookupPort } from './application/ports/client-lookup.port';
import { PartCatalogPort } from './application/ports/part-catalog.port';
import { ServiceCatalogPort } from './application/ports/service-catalog.port';
import { ServiceOrderNotifierPort } from './application/ports/service-order-notifier.port';
import { ServiceOrderRepositoryPort } from './application/ports/service-order-repository.port';
import { VehicleLookupPort } from './application/ports/vehicle-lookup.port';
import { ServiceOrderTransition } from './application/services/service-order-transition';
import { AssignMechanicUseCase } from './application/use-cases/assign-mechanic.use-case';
import { AwaitApprovalUseCase } from './application/use-cases/await-approval.use-case';
import { AwaitPartsUseCase } from './application/use-cases/await-parts.use-case';
import { AwaitPaymentUseCase } from './application/use-cases/await-payment.use-case';
import { CancelServiceOrderUseCase } from './application/use-cases/cancel-service-order.use-case';
import { CompleteServiceOrderUseCase } from './application/use-cases/complete-service-order.use-case';
import { DeliverServiceOrderUseCase } from './application/use-cases/deliver-service-order.use-case';
import { FindServiceOrderUseCase } from './application/use-cases/find-service-order.use-case';
import { GetAverageExecutionTimeUseCase } from './application/use-cases/get-average-execution-time.use-case';
import { ListServiceOrdersByClientUseCase } from './application/use-cases/list-service-orders-by-client.use-case';
import { ListServiceOrdersUseCase } from './application/use-cases/list-service-orders.use-case';
import { OpenServiceOrderUseCase } from './application/use-cases/open-service-order.use-case';
import { RegisterPartsDispatchedUseCase } from './application/use-cases/register-parts-dispatched.use-case';
import { ClientLookupAdapter } from './infrastructure/integrations/client-lookup.adapter';
import { PartCatalogAdapter } from './infrastructure/integrations/part-catalog.adapter';
import { ServiceCatalogAdapter } from './infrastructure/integrations/service-catalog.adapter';
import { VehicleLookupAdapter } from './infrastructure/integrations/vehicle-lookup.adapter';
import { ServiceOrderNotifierAdapter } from './infrastructure/notifications/service-order-notifier.adapter';
import { PrismaServiceOrderRepository } from './infrastructure/persistence/prisma-service-order.repository';

/**
 * Agregado central. Importa os módulos que a abertura confere (cliente,
 * veículo, catálogo, estoque) e o de notificação; é importado por budget,
 * billing e parts-dispatch, que injetam os casos de uso exportados.
 */
@Module({
  imports: [
    ClientModule,
    VehicleModule,
    NotificationModule,
    ServiceCatalogModule,
    StockModule,
  ],
  controllers: [ServiceOrderController],
  providers: [
    {
      provide: ServiceOrderRepositoryPort,
      useClass: PrismaServiceOrderRepository,
    },
    { provide: ClientLookupPort, useClass: ClientLookupAdapter },
    { provide: VehicleLookupPort, useClass: VehicleLookupAdapter },
    { provide: ServiceCatalogPort, useClass: ServiceCatalogAdapter },
    { provide: PartCatalogPort, useClass: PartCatalogAdapter },
    {
      provide: ServiceOrderNotifierPort,
      useClass: ServiceOrderNotifierAdapter,
    },
    {
      provide: ServiceOrderTransition,
      useFactory: (
        serviceOrders: ServiceOrderRepositoryPort,
        notifier: ServiceOrderNotifierPort,
      ) => new ServiceOrderTransition(serviceOrders, notifier),
      inject: [ServiceOrderRepositoryPort, ServiceOrderNotifierPort],
    },
    {
      provide: OpenServiceOrderUseCase,
      useFactory: (
        serviceOrders: ServiceOrderRepositoryPort,
        clients: ClientLookupPort,
        vehicles: VehicleLookupPort,
        services: ServiceCatalogPort,
        parts: PartCatalogPort,
      ) =>
        new OpenServiceOrderUseCase(
          serviceOrders,
          clients,
          vehicles,
          services,
          parts,
        ),
      inject: [
        ServiceOrderRepositoryPort,
        ClientLookupPort,
        VehicleLookupPort,
        ServiceCatalogPort,
        PartCatalogPort,
      ],
    },
    ...[
      FindServiceOrderUseCase,
      ListServiceOrdersUseCase,
      GetAverageExecutionTimeUseCase,
    ].map((useCase) => ({
      provide: useCase,
      useFactory: (serviceOrders: ServiceOrderRepositoryPort) =>
        new useCase(serviceOrders),
      inject: [ServiceOrderRepositoryPort],
    })),
    {
      provide: ListServiceOrdersByClientUseCase,
      useFactory: (
        serviceOrders: ServiceOrderRepositoryPort,
        clients: ClientLookupPort,
      ) => new ListServiceOrdersByClientUseCase(serviceOrders, clients),
      inject: [ServiceOrderRepositoryPort, ClientLookupPort],
    },
    {
      provide: AssignMechanicUseCase,
      useFactory: (
        serviceOrders: ServiceOrderRepositoryPort,
        transition: ServiceOrderTransition,
      ) => new AssignMechanicUseCase(serviceOrders, transition),
      inject: [ServiceOrderRepositoryPort, ServiceOrderTransition],
    },
    ...[
      AwaitApprovalUseCase,
      AwaitPartsUseCase,
      RegisterPartsDispatchedUseCase,
      CompleteServiceOrderUseCase,
      AwaitPaymentUseCase,
      DeliverServiceOrderUseCase,
      CancelServiceOrderUseCase,
    ].map((useCase) => ({
      provide: useCase,
      useFactory: (transition: ServiceOrderTransition) =>
        new useCase(transition),
      inject: [ServiceOrderTransition],
    })),
  ],
  // O que as políticas dos outros módulos precisam: consultar e mover a OS.
  exports: [
    FindServiceOrderUseCase,
    AwaitApprovalUseCase,
    AwaitPartsUseCase,
    RegisterPartsDispatchedUseCase,
    AwaitPaymentUseCase,
    DeliverServiceOrderUseCase,
  ],
})
export class ServiceOrderModule {}

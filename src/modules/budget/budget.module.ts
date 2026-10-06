import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientModule } from '../client/client.module';
import { NotificationModule } from '../notification/notification.module';
import { ServiceCatalogModule } from '../service-catalog/service-catalog.module';
import { ServiceOrderModule } from '../service-order/service-order.module';
import { StockModule } from '../stock/stock.module';
import { BudgetWebhookController } from './presentation/http/budget-webhook.controller';
import { BudgetController } from './presentation/http/budget.controller';
import { BudgetNotifierPort } from './application/ports/budget-notifier.port';
import { BudgetRepositoryPort } from './application/ports/budget-repository.port';
import { PartCatalogPort } from './application/ports/part-catalog.port';
import { ServiceCatalogPort } from './application/ports/service-catalog.port';
import { ServiceOrderPort } from './application/ports/service-order.port';
import { BudgetItemReferences } from './application/services/budget-item-references';
import { BudgetStore } from './application/services/budget-store';
import { AcceptBudgetUseCase } from './application/use-cases/accept-budget.use-case';
import { AddBudgetItemUseCase } from './application/use-cases/add-budget-item.use-case';
import { ApplyExternalDecisionUseCase } from './application/use-cases/apply-external-decision.use-case';
import { CalculateBudgetTotalUseCase } from './application/use-cases/calculate-budget-total.use-case';
import { CreateBudgetUseCase } from './application/use-cases/create-budget.use-case';
import { FindAcceptedBudgetUseCase } from './application/use-cases/find-accepted-budget.use-case';
import { FindBudgetByApprovalTokenUseCase } from './application/use-cases/find-budget-by-approval-token.use-case';
import { FindBudgetUseCase } from './application/use-cases/find-budget.use-case';
import { ListBudgetsByServiceOrderUseCase } from './application/use-cases/list-budgets-by-service-order.use-case';
import { ListBudgetsUseCase } from './application/use-cases/list-budgets.use-case';
import { RefuseBudgetUseCase } from './application/use-cases/refuse-budget.use-case';
import { RemoveBudgetItemUseCase } from './application/use-cases/remove-budget-item.use-case';
import { SendBudgetUseCase } from './application/use-cases/send-budget.use-case';
import { PartCatalogAdapter } from './infrastructure/integrations/part-catalog.adapter';
import { ServiceCatalogAdapter } from './infrastructure/integrations/service-catalog.adapter';
import { ServiceOrderAdapter } from './infrastructure/integrations/service-order.adapter';
import { BudgetNotifierAdapter } from './infrastructure/notifications/budget-notifier.adapter';
import { PrismaBudgetRepository } from './infrastructure/persistence/prisma-budget.repository';

/**
 * O aceite e a recusa do orçamento movem a OS; catálogo e estoque só são
 * consultados para conferir as referências dos itens. Quem lê o orçamento
 * aceito (despacho de peças, cobrança) importa este módulo e injeta os casos
 * de uso exportados.
 */
@Module({
  imports: [
    ConfigModule,
    ServiceOrderModule,
    ServiceCatalogModule,
    ClientModule,
    NotificationModule,
    StockModule,
  ],
  controllers: [BudgetController, BudgetWebhookController],
  providers: [
    { provide: BudgetRepositoryPort, useClass: PrismaBudgetRepository },
    { provide: ServiceOrderPort, useClass: ServiceOrderAdapter },
    { provide: ServiceCatalogPort, useClass: ServiceCatalogAdapter },
    { provide: PartCatalogPort, useClass: PartCatalogAdapter },
    { provide: BudgetNotifierPort, useClass: BudgetNotifierAdapter },
    {
      provide: BudgetStore,
      useFactory: (
        budgets: BudgetRepositoryPort,
        serviceOrders: ServiceOrderPort,
      ) => new BudgetStore(budgets, serviceOrders),
      inject: [BudgetRepositoryPort, ServiceOrderPort],
    },
    {
      provide: BudgetItemReferences,
      useFactory: (services: ServiceCatalogPort, parts: PartCatalogPort) =>
        new BudgetItemReferences(services, parts),
      inject: [ServiceCatalogPort, PartCatalogPort],
    },
    {
      provide: CreateBudgetUseCase,
      useFactory: (
        budgets: BudgetRepositoryPort,
        serviceOrders: ServiceOrderPort,
        references: BudgetItemReferences,
      ) => new CreateBudgetUseCase(budgets, serviceOrders, references),
      inject: [BudgetRepositoryPort, ServiceOrderPort, BudgetItemReferences],
    },
    {
      provide: AddBudgetItemUseCase,
      useFactory: (store: BudgetStore, references: BudgetItemReferences) =>
        new AddBudgetItemUseCase(store, references),
      inject: [BudgetStore, BudgetItemReferences],
    },
    ...[
      RemoveBudgetItemUseCase,
      CalculateBudgetTotalUseCase,
      RefuseBudgetUseCase,
      FindBudgetUseCase,
    ].map((useCase) => ({
      provide: useCase,
      useFactory: (store: BudgetStore) => new useCase(store),
      inject: [BudgetStore],
    })),
    {
      provide: SendBudgetUseCase,
      useFactory: (store: BudgetStore, notifier: BudgetNotifierPort) =>
        new SendBudgetUseCase(store, notifier),
      inject: [BudgetStore, BudgetNotifierPort],
    },
    {
      provide: AcceptBudgetUseCase,
      useFactory: (
        store: BudgetStore,
        serviceOrders: ServiceOrderPort,
        notifier: BudgetNotifierPort,
      ) => new AcceptBudgetUseCase(store, serviceOrders, notifier),
      inject: [BudgetStore, ServiceOrderPort, BudgetNotifierPort],
    },
    ...[
      ListBudgetsUseCase,
      FindAcceptedBudgetUseCase,
      FindBudgetByApprovalTokenUseCase,
    ].map((useCase) => ({
      provide: useCase,
      useFactory: (budgets: BudgetRepositoryPort) => new useCase(budgets),
      inject: [BudgetRepositoryPort],
    })),
    {
      provide: ListBudgetsByServiceOrderUseCase,
      useFactory: (budgets: BudgetRepositoryPort, store: BudgetStore) =>
        new ListBudgetsByServiceOrderUseCase(budgets, store),
      inject: [BudgetRepositoryPort, BudgetStore],
    },
    {
      provide: ApplyExternalDecisionUseCase,
      useFactory: (
        findByToken: FindBudgetByApprovalTokenUseCase,
        accept: AcceptBudgetUseCase,
        refuse: RefuseBudgetUseCase,
      ) => new ApplyExternalDecisionUseCase(findByToken, accept, refuse),
      inject: [
        FindBudgetByApprovalTokenUseCase,
        AcceptBudgetUseCase,
        RefuseBudgetUseCase,
      ],
    },
  ],
  exports: [ListBudgetsByServiceOrderUseCase, FindAcceptedBudgetUseCase],
})
export class BudgetModule {}

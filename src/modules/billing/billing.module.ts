import { Module } from '@nestjs/common';
import { BudgetModule } from '../budget/budget.module';
import { ClientModule } from '../client/client.module';
import { NotificationModule } from '../notification/notification.module';
import { ServiceOrderModule } from '../service-order/service-order.module';
import { AcceptedBudgetPort } from './application/ports/accepted-budget.port';
import { BillingNotifierPort } from './application/ports/billing-notifier.port';
import { BillingRepositoryPort } from './application/ports/billing-repository.port';
import { PaymentGatewayPort } from './application/ports/payment-gateway.port';
import { ServiceOrderPort } from './application/ports/service-order.port';
import { BillingStore } from './application/services/billing-store';
import { PaymentLinkIssuer } from './application/services/payment-link-issuer';
import { PaymentSettlement } from './application/services/payment-settlement';
import { ConfirmPaymentReturnUseCase } from './application/use-cases/confirm-payment-return.use-case';
import { DeliverBilledServiceOrderUseCase } from './application/use-cases/deliver-billed-service-order.use-case';
import { ExpireBillingUseCase } from './application/use-cases/expire-billing.use-case';
import { FindBillingByServiceOrderUseCase } from './application/use-cases/find-billing-by-service-order.use-case';
import { FindBillingUseCase } from './application/use-cases/find-billing.use-case';
import { GenerateBillingUseCase } from './application/use-cases/generate-billing.use-case';
import { HandlePaymentWebhookUseCase } from './application/use-cases/handle-payment-webhook.use-case';
import { ListBillingsUseCase } from './application/use-cases/list-billings.use-case';
import { RegisterPaymentCancellationUseCase } from './application/use-cases/register-payment-cancellation.use-case';
import { RenewPaymentLinkUseCase } from './application/use-cases/renew-payment-link.use-case';
import { AcceptedBudgetAdapter } from './infrastructure/integrations/accepted-budget.adapter';
import { ServiceOrderAdapter } from './infrastructure/integrations/service-order.adapter';
import { BillingNotifierAdapter } from './infrastructure/notifications/billing-notifier.adapter';
import { StripePaymentGateway } from './infrastructure/payment/stripe-payment.gateway';
import { PrismaBillingRepository } from './infrastructure/persistence/prisma-billing.repository';
import { BillingController } from './presentation/http/billing.controller';
import { PaymentController } from './presentation/http/payment.controller';

/**
 * Topo do grafo: ninguém depende da cobrança, então o módulo não exporta
 * nada. Os testes e2e trocam `PaymentGatewayPort` pelo gateway falso.
 */
@Module({
  imports: [BudgetModule, ClientModule, NotificationModule, ServiceOrderModule],
  controllers: [BillingController, PaymentController],
  providers: [
    { provide: BillingRepositoryPort, useClass: PrismaBillingRepository },
    { provide: PaymentGatewayPort, useClass: StripePaymentGateway },
    { provide: ServiceOrderPort, useClass: ServiceOrderAdapter },
    { provide: AcceptedBudgetPort, useClass: AcceptedBudgetAdapter },
    { provide: BillingNotifierPort, useClass: BillingNotifierAdapter },
    {
      provide: BillingStore,
      useFactory: (
        billings: BillingRepositoryPort,
        serviceOrders: ServiceOrderPort,
      ) => new BillingStore(billings, serviceOrders),
      inject: [BillingRepositoryPort, ServiceOrderPort],
    },
    {
      provide: PaymentLinkIssuer,
      useFactory: (
        billings: BillingRepositoryPort,
        gateway: PaymentGatewayPort,
      ) => new PaymentLinkIssuer(billings, gateway),
      inject: [BillingRepositoryPort, PaymentGatewayPort],
    },
    {
      provide: PaymentSettlement,
      useFactory: (
        billings: BillingRepositoryPort,
        store: BillingStore,
        gateway: PaymentGatewayPort,
        serviceOrders: ServiceOrderPort,
      ) => new PaymentSettlement(billings, store, gateway, serviceOrders),
      inject: [
        BillingRepositoryPort,
        BillingStore,
        PaymentGatewayPort,
        ServiceOrderPort,
      ],
    },
    {
      provide: GenerateBillingUseCase,
      useFactory: (
        billings: BillingRepositoryPort,
        store: BillingStore,
        acceptedBudgets: AcceptedBudgetPort,
        linkIssuer: PaymentLinkIssuer,
        notifier: BillingNotifierPort,
      ) =>
        new GenerateBillingUseCase(
          billings,
          store,
          acceptedBudgets,
          linkIssuer,
          notifier,
        ),
      inject: [
        BillingRepositoryPort,
        BillingStore,
        AcceptedBudgetPort,
        PaymentLinkIssuer,
        BillingNotifierPort,
      ],
    },
    ...[FindBillingUseCase, ExpireBillingUseCase].map((useCase) => ({
      provide: useCase,
      useFactory: (store: BillingStore) => new useCase(store),
      inject: [BillingStore],
    })),
    ...[FindBillingByServiceOrderUseCase, ListBillingsUseCase].map(
      (useCase) => ({
        provide: useCase,
        useFactory: (billings: BillingRepositoryPort) => new useCase(billings),
        inject: [BillingRepositoryPort],
      }),
    ),
    {
      provide: RenewPaymentLinkUseCase,
      useFactory: (store: BillingStore, linkIssuer: PaymentLinkIssuer) =>
        new RenewPaymentLinkUseCase(store, linkIssuer),
      inject: [BillingStore, PaymentLinkIssuer],
    },
    {
      provide: HandlePaymentWebhookUseCase,
      useFactory: (
        store: BillingStore,
        gateway: PaymentGatewayPort,
        settlement: PaymentSettlement,
      ) => new HandlePaymentWebhookUseCase(store, gateway, settlement),
      inject: [BillingStore, PaymentGatewayPort, PaymentSettlement],
    },
    {
      provide: ConfirmPaymentReturnUseCase,
      useFactory: (store: BillingStore, settlement: PaymentSettlement) =>
        new ConfirmPaymentReturnUseCase(store, settlement),
      inject: [BillingStore, PaymentSettlement],
    },
    {
      provide: RegisterPaymentCancellationUseCase,
      useFactory: (
        store: BillingStore,
        serviceOrders: ServiceOrderPort,
        settlement: PaymentSettlement,
      ) =>
        new RegisterPaymentCancellationUseCase(
          store,
          serviceOrders,
          settlement,
        ),
      inject: [BillingStore, ServiceOrderPort, PaymentSettlement],
    },
    {
      provide: DeliverBilledServiceOrderUseCase,
      useFactory: (store: BillingStore, serviceOrders: ServiceOrderPort) =>
        new DeliverBilledServiceOrderUseCase(store, serviceOrders),
      inject: [BillingStore, ServiceOrderPort],
    },
  ],
})
export class BillingModule {}

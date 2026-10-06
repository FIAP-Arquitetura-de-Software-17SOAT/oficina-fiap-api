import { Module } from '@nestjs/common';
import { BudgetModule } from '../budget/budget.module';
import { PurchaseOrderModule } from '../purchase-order/purchase-order.module';
import { ServiceOrderModule } from '../service-order/service-order.module';
import { StockModule } from '../stock/stock.module';
import { AcceptedBudgetsPort } from './application/ports/accepted-budgets.port';
import { ServiceOrderDispatchPort } from './application/ports/service-order-dispatch.port';
import { ShortagePurchasePort } from './application/ports/shortage-purchase.port';
import { StockPort } from './application/ports/stock.port';
import { DispatchPartsForServiceOrderUseCase } from './application/use-cases/dispatch-parts-for-service-order.use-case';
import { BudgetAdapter } from './infrastructure/integrations/budget.adapter';
import { PurchaseOrderAdapter } from './infrastructure/integrations/purchase-order.adapter';
import { ServiceOrderAdapter } from './infrastructure/integrations/service-order.adapter';
import { StockAdapter } from './infrastructure/integrations/stock.adapter';
import { PartsDispatchController } from './presentation/http/parts-dispatch.controller';

/**
 * Módulo de fluxo: importa os quatro agregados que a política de despacho
 * orquestra e não é importado por nenhum deles. É o que desfaz os ciclos
 * estoque <-> orçamento / OS / pedido de compra da Fase 1.
 */
@Module({
  imports: [StockModule, BudgetModule, ServiceOrderModule, PurchaseOrderModule],
  controllers: [PartsDispatchController],
  providers: [
    { provide: AcceptedBudgetsPort, useClass: BudgetAdapter },
    { provide: StockPort, useClass: StockAdapter },
    { provide: ServiceOrderDispatchPort, useClass: ServiceOrderAdapter },
    { provide: ShortagePurchasePort, useClass: PurchaseOrderAdapter },
    {
      provide: DispatchPartsForServiceOrderUseCase,
      useFactory: (
        budgets: AcceptedBudgetsPort,
        stock: StockPort,
        serviceOrders: ServiceOrderDispatchPort,
        purchases: ShortagePurchasePort,
      ) =>
        new DispatchPartsForServiceOrderUseCase(
          budgets,
          stock,
          serviceOrders,
          purchases,
        ),
      inject: [
        AcceptedBudgetsPort,
        StockPort,
        ServiceOrderDispatchPort,
        ShortagePurchasePort,
      ],
    },
  ],
})
export class PartsDispatchModule {}

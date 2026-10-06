import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { PurchaseOrderController } from './presentation/http/purchase-order.controller';
import { PartCatalogPort } from './application/ports/part-catalog.port';
import { PurchaseOrderRepositoryPort } from './application/ports/purchase-order-repository.port';
import { StockReceiptPort } from './application/ports/stock-receipt.port';
import { AddPurchaseOrderItemUseCase } from './application/use-cases/add-purchase-order-item.use-case';
import { CreatePurchaseOrderUseCase } from './application/use-cases/create-purchase-order.use-case';
import { FindPurchaseOrderUseCase } from './application/use-cases/find-purchase-order.use-case';
import { ListPurchaseOrdersUseCase } from './application/use-cases/list-purchase-orders.use-case';
import { MarkPurchaseOrderDeliveredUseCase } from './application/use-cases/mark-purchase-order-delivered.use-case';
import { RegisterPurchaseUseCase } from './application/use-cases/register-purchase.use-case';
import { RegisterShortageUseCase } from './application/use-cases/register-shortage.use-case';
import { RemovePurchaseOrderItemUseCase } from './application/use-cases/remove-purchase-order-item.use-case';
import { ResolvePartNamesQuery } from './application/use-cases/resolve-part-names.query';
import { PartCatalogAdapter } from './infrastructure/integrations/part-catalog.adapter';
import { StockReceiptAdapter } from './infrastructure/integrations/stock-receipt.adapter';
import { PrismaPurchaseOrderRepository } from './infrastructure/persistence/prisma-purchase-order.repository';

@Module({
  // O pedido consulta e devolve peças ao estoque pelos adapters. Quem abre o
  // pedido quando falta peça é o módulo parts-dispatch, que importa este.
  imports: [StockModule],
  controllers: [PurchaseOrderController],
  providers: [
    {
      provide: PurchaseOrderRepositoryPort,
      useClass: PrismaPurchaseOrderRepository,
    },
    { provide: PartCatalogPort, useClass: PartCatalogAdapter },
    { provide: StockReceiptPort, useClass: StockReceiptAdapter },
    ...[
      CreatePurchaseOrderUseCase,
      FindPurchaseOrderUseCase,
      ListPurchaseOrdersUseCase,
      AddPurchaseOrderItemUseCase,
      RemovePurchaseOrderItemUseCase,
      RegisterPurchaseUseCase,
    ].map((useCase) => ({
      provide: useCase,
      useFactory: (purchaseOrders: PurchaseOrderRepositoryPort) =>
        new useCase(purchaseOrders),
      inject: [PurchaseOrderRepositoryPort],
    })),
    {
      provide: MarkPurchaseOrderDeliveredUseCase,
      useFactory: (
        purchaseOrders: PurchaseOrderRepositoryPort,
        stock: StockReceiptPort,
      ) => new MarkPurchaseOrderDeliveredUseCase(purchaseOrders, stock),
      inject: [PurchaseOrderRepositoryPort, StockReceiptPort],
    },
    {
      provide: RegisterShortageUseCase,
      useFactory: (
        purchaseOrders: PurchaseOrderRepositoryPort,
        catalog: PartCatalogPort,
      ) => new RegisterShortageUseCase(purchaseOrders, catalog),
      inject: [PurchaseOrderRepositoryPort, PartCatalogPort],
    },
    {
      provide: ResolvePartNamesQuery,
      useFactory: (catalog: PartCatalogPort) =>
        new ResolvePartNamesQuery(catalog),
      inject: [PartCatalogPort],
    },
  ],
  exports: [RegisterShortageUseCase],
})
export class PurchaseOrderModule {}

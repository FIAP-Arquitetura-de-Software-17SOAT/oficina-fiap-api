import { Module } from '@nestjs/common';
import { PartController } from './presentation/http/part.controller';
import { PartRepositoryPort } from './application/ports/part-repository.port';
import { StockMovementRepositoryPort } from './application/ports/stock-movement-repository.port';
import { CreatePartUseCase } from './application/use-cases/create-part.use-case';
import { FindPartUseCase } from './application/use-cases/find-part.use-case';
import { ListPartsUseCase } from './application/use-cases/list-parts.use-case';
import { UpdatePartUseCase } from './application/use-cases/update-part.use-case';
import { DeletePartUseCase } from './application/use-cases/delete-part.use-case';
import { IncreaseStockUseCase } from './application/use-cases/increase-stock.use-case';
import { DecreaseStockUseCase } from './application/use-cases/decrease-stock.use-case';
import { PrismaPartRepository } from './infrastructure/persistence/prisma-part.repository';
import { PrismaStockMovementRepository } from './infrastructure/persistence/prisma-stock-movement.repository';

/**
 * Folha do grafo: o estoque não conhece nenhum outro módulo. Quem precisa de
 * peça (OS, orçamento, pedido de compra, despacho) importa este e injeta um
 * dos casos de uso exportados.
 */
@Module({
  controllers: [PartController],
  providers: [
    { provide: PartRepositoryPort, useClass: PrismaPartRepository },
    {
      provide: StockMovementRepositoryPort,
      useClass: PrismaStockMovementRepository,
    },
    ...[
      CreatePartUseCase,
      FindPartUseCase,
      ListPartsUseCase,
      UpdatePartUseCase,
      DeletePartUseCase,
    ].map((useCase) => ({
      provide: useCase,
      useFactory: (parts: PartRepositoryPort) => new useCase(parts),
      inject: [PartRepositoryPort],
    })),
    ...[IncreaseStockUseCase, DecreaseStockUseCase].map((useCase) => ({
      provide: useCase,
      useFactory: (movements: StockMovementRepositoryPort) =>
        new useCase(movements),
      inject: [StockMovementRepositoryPort],
    })),
  ],
  exports: [FindPartUseCase, IncreaseStockUseCase, DecreaseStockUseCase],
})
export class StockModule {}

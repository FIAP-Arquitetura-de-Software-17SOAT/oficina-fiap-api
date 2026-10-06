import { StockMovementType } from '../../domain/enums/stock-movement-type.enum';
import {
  AppliedStockMovement,
  StockMovementInput,
} from '../contracts/stock-movement';
import { StockMovementRepositoryPort } from '../ports/stock-movement-repository.port';
import { applyStockMovement } from '../services/apply-stock-movement';

export class DecreaseStockUseCase {
  constructor(private readonly movements: StockMovementRepositoryPort) {}

  execute(
    partId: string,
    input: StockMovementInput,
  ): Promise<AppliedStockMovement> {
    return applyStockMovement(
      this.movements,
      partId,
      StockMovementType.OUT,
      input,
    );
  }
}

import { StockMovementType } from '../../domain/enums/stock-movement-type.enum';
import {
  AppliedStockMovement,
  StockMovementInput,
} from '../contracts/stock-movement';
import { StockApplicationError } from '../errors/stock-application.error';
import { StockMovementRepositoryPort } from '../ports/stock-movement-repository.port';

/** Validação comum à entrada e à saída; a atomicidade fica na porta. */
export async function applyStockMovement(
  movements: StockMovementRepositoryPort,
  partId: string,
  type: StockMovementType,
  input: StockMovementInput,
): Promise<AppliedStockMovement> {
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
    throw new StockApplicationError('MOVEMENT_QUANTITY_INVALID');
  }
  if (!input.idempotencyKey?.trim()) {
    throw new StockApplicationError('IDEMPOTENCY_KEY_REQUIRED');
  }

  return movements.apply({
    partId,
    type,
    quantity: input.quantity,
    idempotencyKey: input.idempotencyKey.trim(),
  });
}

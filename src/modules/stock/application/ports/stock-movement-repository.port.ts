import {
  AppliedStockMovement,
  ApplyStockMovementInput,
} from '../contracts/stock-movement';

/**
 * Operação atômica: grava o movimento e ajusta o saldo na mesma transação,
 * com a chave de idempotência garantida pelo banco. Fica na porta de
 * persistência porque a atomicidade é responsabilidade dela, não do caso de
 * uso. Lança `StockApplicationError` com `INSUFFICIENT_STOCK`,
 * `IDEMPOTENCY_KEY_CONFLICT` ou `MOVEMENT_PART_NOT_FOUND`.
 */
export abstract class StockMovementRepositoryPort {
  abstract apply(input: ApplyStockMovementInput): Promise<AppliedStockMovement>;
}

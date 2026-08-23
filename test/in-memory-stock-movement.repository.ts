import { randomUUID } from 'crypto';
import {
  AppliedStockMovement,
  ApplyStockMovementInput,
  IdempotencyConflictError,
  InsufficientStockError,
  PartNotFoundError,
  StockMovementType,
} from '../src/modules/stock/repositories/stock-movement.repository';
import { InMemoryPartRepository } from './in-memory-part.repository';

/**
 * Reproduz o contrato do repositório real: aplica o movimento sobre a peça,
 * recusa saldo insuficiente e devolve o resultado anterior quando a mesma chave
 * de idempotência chega de novo.
 */
export class InMemoryStockMovementRepository {
  private readonly applied = new Map<string, AppliedStockMovement>();

  constructor(private readonly parts: InMemoryPartRepository) {}

  async apply(input: ApplyStockMovementInput): Promise<AppliedStockMovement> {
    const previous = this.applied.get(input.idempotencyKey);

    if (previous) {
      if (
        previous.movement.partId !== input.partId ||
        previous.movement.type !== input.type ||
        previous.movement.quantity !== input.quantity
      ) {
        throw new IdempotencyConflictError();
      }

      return { ...previous, replayed: true };
    }

    const part = await this.parts.findById(input.partId);

    if (!part) {
      throw new PartNotFoundError();
    }

    if (input.type === StockMovementType.OUT) {
      if (!part.hasAvailability(input.quantity)) {
        throw new InsufficientStockError();
      }

      part.decreaseStock(input.quantity);
    } else {
      part.increaseStock(input.quantity);
    }

    await this.parts.update(part);

    const result: AppliedStockMovement = {
      movement: {
        id: randomUUID(),
        idempotencyKey: input.idempotencyKey,
        type: input.type,
        quantity: input.quantity,
        partId: input.partId,
        createdAt: new Date(),
      },
      part,
      replayed: false,
    };

    this.applied.set(input.idempotencyKey, result);

    return result;
  }
}

import { Part } from '../../domain/entities/part.entity';
import { StockMovementType } from '../../domain/enums/stock-movement-type.enum';

/** O que o chamador informa para entrar ou sair estoque. */
export interface StockMovementInput {
  quantity: number;
  /** Gerada uma vez por quem chama; repetir a chave repete o resultado. */
  idempotencyKey: string;
}

export interface ApplyStockMovementInput {
  partId: string;
  type: StockMovementType;
  quantity: number;
  idempotencyKey: string;
}

export interface AppliedStockMovement {
  movement: {
    id: string;
    idempotencyKey: string;
    type: StockMovementType;
    quantity: number;
    partId: string;
    createdAt: Date;
  };
  part: Part;
  /** true quando a chave já tinha sido aplicada e o resultado foi devolvido. */
  replayed: boolean;
}

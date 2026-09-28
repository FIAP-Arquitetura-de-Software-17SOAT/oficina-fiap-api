import { Part } from '../../domain/entities/part.entity';

/**
 * A implementação traduz as violações do banco em `StockApplicationError`:
 * código repetido (`PART_CODE_IN_USE`), peça removida no meio da operação
 * (`PART_NOT_FOUND`) e peça ainda referenciada (`PART_HAS_LINKS`).
 */
export abstract class PartRepositoryPort {
  abstract create(part: Part): Promise<Part>;
  abstract findById(id: string): Promise<Part | null>;
  abstract findByCode(code: string): Promise<Part | null>;
  abstract findAll(): Promise<Part[]>;
  abstract update(part: Part): Promise<Part>;
  abstract delete(id: string): Promise<void>;
}

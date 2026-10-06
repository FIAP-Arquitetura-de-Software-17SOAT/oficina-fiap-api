import { Money } from '../../../../shared/domain/value-objects/money.vo';
import {
  MeasurementUnit,
  Part,
  PartType,
} from '../../domain/entities/part.entity';

export interface PartRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: string;
  unit: string;
  unitPriceCents: number;
  quantity: number;
  minimumQuantity: number;
  createdAt: Date;
  updatedAt: Date;
}

export class PartPersistenceMapper {
  static toCreate(part: Part) {
    return {
      id: part.getId(),
      code: part.getCode().getValue(),
      name: part.getName(),
      description: part.getDescription(),
      type: part.getType(),
      unit: part.getUnit(),
      unitPriceCents: part.getUnitPrice().valueInCents,
      quantity: part.getQuantity().getValue(),
      minimumQuantity: part.getMinimumQuantity().getValue(),
      createdAt: part.getCreatedAt(),
      updatedAt: part.getUpdatedAt(),
    };
  }

  /** Saldo não entra no update: só muda por movimentação atômica. */
  static toUpdate(part: Part) {
    return {
      code: part.getCode().getValue(),
      name: part.getName(),
      description: part.getDescription(),
      type: part.getType(),
      unit: part.getUnit(),
      unitPriceCents: part.getUnitPrice().valueInCents,
      minimumQuantity: part.getMinimumQuantity().getValue(),
      updatedAt: part.getUpdatedAt(),
    };
  }

  static toDomain(row: PartRow): Part {
    return Part.restore(row.id, {
      code: row.code,
      name: row.name,
      description: row.description ?? undefined,
      type: row.type as PartType,
      unit: row.unit as MeasurementUnit,
      unitPrice: Money.fromCents(row.unitPriceCents).value,
      quantity: row.quantity,
      minimumQuantity: row.minimumQuantity,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}

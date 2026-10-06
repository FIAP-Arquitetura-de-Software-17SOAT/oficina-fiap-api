import { MeasurementUnit } from '../../domain/enums/measurement-unit.enum';
import { PartType } from '../../domain/enums/part-type.enum';

export interface CreatePartInput {
  code: string;
  name: string;
  description?: string;
  type: PartType;
  unit: MeasurementUnit;
  /** Decimal como chega na API (149.90). */
  unitPrice: number;
  minimumQuantity: number;
}

export interface UpdatePartInput {
  code?: string;
  name?: string;
  description?: string;
  type?: PartType;
  unit?: MeasurementUnit;
  unitPrice?: number;
  minimumQuantity?: number;
}

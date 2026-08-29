import { randomUUID } from 'crypto';
import { DomainException } from '../../../shared/domain/domain.exception';
import { Money } from '../../../shared/domain/value-objects/money.vo';
import { PartCode } from '../value-objects/part-code.vo';
import { MeasurementUnit } from '../enums/measurement-unit.enum';
import { PartType } from '../enums/part-type.enum';

export { MeasurementUnit, PartType };
import { Quantity } from '../../../shared/domain/value-objects/quantity.vo';

export interface PartProps {
  code: string;
  name: string;
  description?: string;
  type: PartType;
  unit: MeasurementUnit;
  unitPrice: number;
  quantity: number;
  minimumQuantity: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PartUpdateProps = Partial<
  Omit<PartProps, 'createdAt' | 'updatedAt' | 'quantity'>
>;

export class Part {
  private readonly id: string;
  private code: PartCode;
  private name: string;
  private description?: string;
  private type: PartType;
  private unit: MeasurementUnit;
  private unitPrice: Money;
  private quantity: Quantity;
  private minimumQuantity: Quantity;
  private readonly createdAt: Date;
  private updatedAt: Date;

  private constructor(id: string, props: PartProps) {
    this.id = id;
    this.code = PartCode.create(props.code);
    this.name = Part.normalizeName(props.name);
    this.description = Part.normalizeDescription(props.description);
    this.type = Part.validateType(props.type);
    this.unit = Part.validateUnit(props.unit);
    this.unitPrice = Money.fromDecimal(props.unitPrice);
    this.quantity = Quantity.create(props.quantity);
    this.minimumQuantity = Quantity.create(props.minimumQuantity);
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
  }

  static create(props: PartProps): Part {
    return new Part(randomUUID(), props);
  }

  static restore(id: string, props: PartProps): Part {
    return new Part(id, props);
  }

  getId(): string {
    return this.id;
  }

  getCode(): PartCode {
    return this.code;
  }

  getName(): string {
    return this.name;
  }

  getDescription(): string | undefined {
    return this.description;
  }

  getType(): PartType {
    return this.type;
  }

  getUnit(): MeasurementUnit {
    return this.unit;
  }

  getUnitPrice(): Money {
    return this.unitPrice;
  }

  getQuantity(): Quantity {
    return this.quantity;
  }

  getMinimumQuantity(): Quantity {
    return this.minimumQuantity;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  /** Disponibilidade (§3): o saldo em relação à quantidade necessária. */
  hasAvailability(quantity: number): boolean {
    return this.quantity.isAtLeast(Quantity.positive(quantity));
  }

  /** Saída de estoque (regra 17: movimento é inteiro e positivo). */
  decreaseStock(quantity: number): void {
    const requestedQuantity = Quantity.positive(quantity);

    if (!this.quantity.isAtLeast(requestedQuantity)) {
      throw new DomainException(
        'Quantidade solicitada indisponível em estoque',
      );
    }

    // subtract já recusa saldo negativo (regra 18): a checagem acima existe
    // para dar a mensagem de negócio, não para evitar o estouro.
    this.quantity = this.quantity.subtract(requestedQuantity);
    this.touch();
  }

  /** Entrada de estoque (regra 17). */
  increaseStock(quantity: number): void {
    this.quantity = this.quantity.add(Quantity.positive(quantity));
    this.touch();
  }

  update(props: PartUpdateProps): void {
    if (props.code !== undefined) {
      this.code = PartCode.create(props.code);
    }

    if (props.name !== undefined) {
      this.name = Part.normalizeName(props.name);
    }

    if (props.description !== undefined) {
      this.description = Part.normalizeDescription(props.description);
    }

    if (props.type !== undefined) {
      this.type = Part.validateType(props.type);
    }

    if (props.unit !== undefined) {
      this.unit = Part.validateUnit(props.unit);
    }

    if (props.unitPrice !== undefined) {
      this.unitPrice = Money.fromDecimal(props.unitPrice);
    }

    if (props.minimumQuantity !== undefined) {
      this.minimumQuantity = Quantity.create(props.minimumQuantity);
    }

    this.touch();
  }

  /** Regra 19: repor quando o saldo for menor ou igual à quantidade mínima. */
  needsReorder(): boolean {
    return this.minimumQuantity.isAtLeast(this.quantity);
  }

  private static normalizeName(name: string): string {
    const value = (name ?? '').trim();

    if (!value) {
      throw new DomainException('Nome da peça é obrigatório');
    }

    return value;
  }

  private static normalizeDescription(
    description?: string,
  ): string | undefined {
    const value = description?.trim();

    return value || undefined;
  }

  private static validateType(type: PartType): PartType {
    if (!Object.values(PartType).includes(type)) {
      throw new DomainException('Tipo de item inválido');
    }

    return type;
  }

  private static validateUnit(unit: MeasurementUnit): MeasurementUnit {
    if (!Object.values(MeasurementUnit).includes(unit)) {
      throw new DomainException('Unidade de medida inválida');
    }

    return unit;
  }

  private touch(): void {
    this.updatedAt = new Date();
  }
}

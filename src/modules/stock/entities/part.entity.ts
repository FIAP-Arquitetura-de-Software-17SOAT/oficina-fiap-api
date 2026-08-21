import { randomUUID } from 'crypto';
import { DomainException } from '../../../shared/domain/domain.exception';
import { Money } from '../value-objects/money';
import { PartCode } from '../value-objects/part-code';
import { Quantity } from '../value-objects/quantity';

export enum PartType {
  PART = 'PART',
  SUPPLY = 'SUPPLY',
}

export enum MeasurementUnit {
  UNIT = 'UNIT',
  LITER = 'LITER',
  KILOGRAM = 'KILOGRAM',
}

export interface PartProps {
  code: string;
  name: string;
  description?: string;
  type: PartType;
  unit: MeasurementUnit;
  unitPrice: string;
  quantity: number;
  minimumQuantity: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PartUpdateProps = Partial<
  Omit<PartProps, 'createdAt' | 'updatedAt'>
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
    this.unitPrice = Money.create(props.unitPrice);
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

  hasAvailability(quantity: number): boolean {
    return this.quantity.getValue() >= Quantity.create(quantity).getValue();
  }

  decreaseStock(quantity: number): void {
    const requestedQuantity = Quantity.create(quantity);

    if (!this.hasAvailability(requestedQuantity.getValue())) {
      throw new DomainException(
        'Quantidade solicitada indisponível em estoque',
      );
    }

    this.quantity = Quantity.create(
      this.quantity.getValue() - requestedQuantity.getValue(),
    );
    this.touch();
  }

  increaseStock(quantity: number): void {
    const increasedQuantity = Quantity.create(
      this.quantity.getValue() + Quantity.create(quantity).getValue(),
    );

    this.quantity = increasedQuantity;
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
      this.unitPrice = Money.create(props.unitPrice);
    }

    if (props.quantity !== undefined) {
      this.quantity = Quantity.create(props.quantity);
    }

    if (props.minimumQuantity !== undefined) {
      this.minimumQuantity = Quantity.create(props.minimumQuantity);
    }

    this.touch();
  }

  needsReorder(): boolean {
    return this.quantity.getValue() <= this.minimumQuantity.getValue();
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

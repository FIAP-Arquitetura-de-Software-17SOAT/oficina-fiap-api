import { randomUUID } from 'crypto';
import { DomainException } from '../../../shared/domain/domain.exception';
import { ModelYear } from '../value-objects/model-year.vo';
import { Plate } from '../value-objects/plate.vo';

export interface VehicleProps {
  clientId: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Vehicle {
  private readonly id: string;
  private readonly clientId: string;
  private plate: Plate;
  private brand: string;
  private model: string;
  private year: ModelYear;
  private readonly createdAt: Date;
  private updatedAt: Date;

  private constructor(id: string, props: VehicleProps) {
    this.id = id;
    this.clientId = Vehicle.validateClientId(props.clientId);

    this.setPlate(props.plate);
    this.setBrand(props.brand);
    this.setModel(props.model);
    this.setYear(props.year);

    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
  }

  static create(props: VehicleProps): Vehicle {
    return new Vehicle(randomUUID(), props);
  }

  static restore(id: string, props: VehicleProps): Vehicle {
    return new Vehicle(id, props);
  }

  getId(): string {
    return this.id;
  }

  getClientId(): string {
    return this.clientId;
  }

  getPlate(): Plate {
    return this.plate;
  }

  getBrand(): string {
    return this.brand;
  }

  getModel(): string {
    return this.model;
  }

  getYear(): ModelYear {
    return this.year;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  changeBrand(brand: string): void {
    this.setBrand(brand);
    this.touch();
  }

  changeModel(model: string): void {
    this.setModel(model);
    this.touch();
  }

  changeYear(year: number): void {
    this.setYear(year);
    this.touch();
  }

  /**
   * Placa e dono não são alteráveis: identificam o veículo. Reemplacamento ou
   * venda são cadastro novo, para não reescrever o histórico de ordens de
   * serviço já executadas.
   */
  private setPlate(plate: string): void {
    this.plate = Plate.create(plate);
  }

  private static validateClientId(clientId: string): string {
    const trimmed = (clientId ?? '').trim();

    if (!trimmed) {
      throw new DomainException('Veículo precisa de um cliente');
    }

    return trimmed;
  }

  private setBrand(brand: string): void {
    const trimmed = (brand ?? '').trim();

    if (!trimmed) {
      throw new DomainException('Marca do veículo é obrigatória');
    }

    this.brand = trimmed;
  }

  private setModel(model: string): void {
    const trimmed = (model ?? '').trim();

    if (!trimmed) {
      throw new DomainException('Modelo do veículo é obrigatório');
    }

    this.model = trimmed;
  }

  private setYear(year: number): void {
    this.year = ModelYear.create(year);
  }

  private touch(): void {
    this.updatedAt = new Date();
  }
}

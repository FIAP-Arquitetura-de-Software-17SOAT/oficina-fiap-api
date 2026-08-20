import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClientService } from '../../client/services/client.service';
import { CreateVehicleDto, UpdateVehicleDto } from '../dto/vehicle.dto';
import { Vehicle } from '../entities/vehicle.entity';
import { VehicleRepository } from '../repositories/vehicle.repository';
import { Plate } from '../value-objects/plate.vo';

@Injectable()
export class VehicleService {
  constructor(
    private readonly vehicleRepository: VehicleRepository,
    private readonly clientService: ClientService,
  ) {}

  async create(dto: CreateVehicleDto): Promise<Vehicle> {
    // Normaliza pela VO antes de consultar: "abc-1d23" e "ABC1D23" são a mesma
    // placa, e o banco guarda apenas a forma normalizada.
    const plate = Plate.create(dto.plate);

    // Lança NotFound se o cliente não existir, antes de gravar um veículo órfão.
    await this.clientService.findById(dto.clientId);
    await this.assertPlateIsAvailable(plate);

    const vehicle = Vehicle.create({
      clientId: dto.clientId,
      plate: plate.getValue(),
      brand: dto.brand,
      model: dto.model,
      year: dto.year,
    });

    return this.vehicleRepository.create(vehicle);
  }

  async findById(id: string): Promise<Vehicle> {
    const vehicle = await this.vehicleRepository.findById(id);

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    return vehicle;
  }

  async findAll(clientId?: string): Promise<Vehicle[]> {
    if (clientId) {
      await this.clientService.findById(clientId);
    }

    return this.vehicleRepository.findAll(clientId);
  }

  async update(id: string, dto: UpdateVehicleDto): Promise<Vehicle> {
    const vehicle = await this.findById(id);

    if (dto.brand) {
      vehicle.changeBrand(dto.brand);
    }

    if (dto.model) {
      vehicle.changeModel(dto.model);
    }

    if (dto.year !== undefined) {
      vehicle.changeYear(dto.year);
    }

    return this.vehicleRepository.update(vehicle);
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);

    await this.vehicleRepository.delete(id);
  }

  private async assertPlateIsAvailable(plate: Plate): Promise<void> {
    const existing = await this.vehicleRepository.findByPlate(plate.getValue());

    if (existing) {
      throw new ConflictException('Vehicle already exists');
    }
  }
}

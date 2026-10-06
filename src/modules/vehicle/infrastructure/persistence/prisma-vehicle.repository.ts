import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { isUniqueViolation } from '../../../../shared/database/prisma-errors';
import { Vehicle } from '../../domain/entities/vehicle.entity';
import { VehicleApplicationError } from '../../application/errors/vehicle-application.error';
import { VehicleRepositoryPort } from '../../application/ports/vehicle-repository.port';
import { VehiclePersistenceMapper } from './vehicle-persistence.mapper';

@Injectable()
export class PrismaVehicleRepository implements VehicleRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(vehicle: Vehicle): Promise<Vehicle> {
    try {
      const row = await this.prisma.vehicle.create({
        data: VehiclePersistenceMapper.toPersistence(vehicle),
      });

      return VehiclePersistenceMapper.toDomain(row);
    } catch (error) {
      // A checagem de placa no caso de uso existe pela mensagem melhor, mas há
      // janela entre consultar e inserir: duas requisições simultâneas passam
      // as duas pela consulta e uma recebe P2002. Sem esta tradução, essa
      // perde a corrida e leva 500 em vez de 409.
      if (isUniqueViolation(error)) {
        throw new VehicleApplicationError('VEHICLE_ALREADY_EXISTS');
      }

      throw error;
    }
  }

  async findById(id: string): Promise<Vehicle | null> {
    const row = await this.prisma.vehicle.findUnique({ where: { id } });

    return row ? VehiclePersistenceMapper.toDomain(row) : null;
  }

  async findByPlate(plate: string): Promise<Vehicle | null> {
    const row = await this.prisma.vehicle.findUnique({ where: { plate } });

    return row ? VehiclePersistenceMapper.toDomain(row) : null;
  }

  async findAll(clientId?: string): Promise<Vehicle[]> {
    const rows = await this.prisma.vehicle.findMany({
      where: clientId ? { clientId } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => VehiclePersistenceMapper.toDomain(row));
  }

  async update(vehicle: Vehicle): Promise<Vehicle> {
    const row = await this.prisma.vehicle.update({
      where: { id: vehicle.getId() },
      data: VehiclePersistenceMapper.toUpdate(vehicle),
    });

    return VehiclePersistenceMapper.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.vehicle.delete({ where: { id } });
  }
}

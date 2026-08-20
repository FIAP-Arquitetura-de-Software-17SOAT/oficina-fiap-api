import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { isUniqueViolation } from '../../../shared/database/prisma-errors';
import { Vehicle } from '../entities/vehicle.entity';

interface VehicleRow {
  id: string;
  clientId: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class VehicleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(vehicle: Vehicle): Promise<Vehicle> {
    try {
      const row = await this.prisma.vehicle.create({
        data: {
          id: vehicle.getId(),
          clientId: vehicle.getClientId(),
          plate: vehicle.getPlate().getValue(),
          brand: vehicle.getBrand(),
          model: vehicle.getModel(),
          year: vehicle.getYear().getValue(),
          createdAt: vehicle.getCreatedAt(),
          updatedAt: vehicle.getUpdatedAt(),
        },
      });

      return this.toDomain(row);
    } catch (error) {
      // A checagem de placa no service existe pela mensagem melhor, mas há
      // janela entre consultar e inserir: duas requisições simultâneas passam
      // as duas pela consulta e uma recebe P2002. Sem esta tradução, essa
      // perde a corrida e leva 500 em vez de 409.
      if (isUniqueViolation(error)) {
        throw new ConflictException('Vehicle already exists');
      }

      throw error;
    }
  }

  async findById(id: string): Promise<Vehicle | null> {
    const row = await this.prisma.vehicle.findUnique({ where: { id } });

    return row ? this.toDomain(row) : null;
  }

  async findByPlate(plate: string): Promise<Vehicle | null> {
    const row = await this.prisma.vehicle.findUnique({ where: { plate } });

    return row ? this.toDomain(row) : null;
  }

  async findAll(clientId?: string): Promise<Vehicle[]> {
    const rows = await this.prisma.vehicle.findMany({
      where: clientId ? { clientId } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => this.toDomain(row));
  }

  async update(vehicle: Vehicle): Promise<Vehicle> {
    const row = await this.prisma.vehicle.update({
      where: { id: vehicle.getId() },
      data: {
        brand: vehicle.getBrand(),
        model: vehicle.getModel(),
        year: vehicle.getYear().getValue(),
        updatedAt: vehicle.getUpdatedAt(),
      },
    });

    return this.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.vehicle.delete({ where: { id } });
  }

  private toDomain(row: VehicleRow): Vehicle {
    return Vehicle.restore(row.id, {
      clientId: row.clientId,
      plate: row.plate,
      brand: row.brand,
      model: row.model,
      year: row.year,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}

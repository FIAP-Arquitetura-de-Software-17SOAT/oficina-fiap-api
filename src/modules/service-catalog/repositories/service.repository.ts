import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { isUniqueViolation } from '../../../shared/database/prisma-errors';
import { Money } from '../../../shared/domain/value-objects/money.vo';
import { Service } from '../entities/service.entity';

interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ServiceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(service: Service): Promise<Service> {
    try {
      const row = await this.prisma.service.create({
        data: this.toPersistence(service),
      });

      return this.toDomain(row);
    } catch (error) {
      // A checagem no service existe pela mensagem melhor, mas há janela entre
      // consultar e inserir: duas requisições simultâneas passam as duas pela
      // consulta e uma recebe P2002. Sem esta tradução, ela leva 500.
      if (isUniqueViolation(error)) {
        throw new ConflictException('Service already exists');
      }

      throw error;
    }
  }

  async findById(id: string): Promise<Service | null> {
    const row = await this.prisma.service.findUnique({ where: { id } });

    return row ? this.toDomain(row) : null;
  }

  async findByName(name: string): Promise<Service | null> {
    const row = await this.prisma.service.findUnique({ where: { name } });

    return row ? this.toDomain(row) : null;
  }

  async findAll(): Promise<Service[]> {
    const rows = await this.prisma.service.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => this.toDomain(row));
  }

  async update(service: Service): Promise<Service> {
    try {
      const row = await this.prisma.service.update({
        where: { id: service.getId() },
        data: {
          name: service.getName(),
          description: service.getDescription() ?? null,
          priceCents: service.getPrice().valueInCents,
          updatedAt: service.getUpdatedAt(),
        },
      });

      return this.toDomain(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Service already exists');
      }

      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    await this.prisma.service.delete({ where: { id } });
  }

  private toPersistence(service: Service) {
    return {
      id: service.getId(),
      name: service.getName(),
      description: service.getDescription() ?? null,
      priceCents: service.getPrice().valueInCents,
      createdAt: service.getCreatedAt(),
      updatedAt: service.getUpdatedAt(),
    };
  }

  private toDomain(row: ServiceRow): Service {
    return Service.restore(row.id, {
      name: row.name,
      description: row.description,
      price: Money.fromCents(row.priceCents).value,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}

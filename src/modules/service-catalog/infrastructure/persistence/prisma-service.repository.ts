import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { isUniqueViolation } from '../../../../shared/database/prisma-errors';
import { Service } from '../../domain/entities/service.entity';
import { ServiceCatalogApplicationError } from '../../application/errors/service-catalog-application.error';
import { ServiceRepositoryPort } from '../../application/ports/service-repository.port';
import { ServicePersistenceMapper } from './service-persistence.mapper';

@Injectable()
export class PrismaServiceRepository implements ServiceRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(service: Service): Promise<Service> {
    try {
      const row = await this.prisma.service.create({
        data: ServicePersistenceMapper.toPersistence(service),
      });

      return ServicePersistenceMapper.toDomain(row);
    } catch (error) {
      // A checagem de nome no caso de uso existe pela mensagem melhor, mas há
      // janela entre consultar e inserir: duas requisições simultâneas passam
      // as duas pela consulta e uma recebe P2002. Sem esta tradução, ela leva
      // 500 em vez de 409.
      if (isUniqueViolation(error)) {
        throw new ServiceCatalogApplicationError('SERVICE_ALREADY_EXISTS');
      }

      throw error;
    }
  }

  async findById(id: string): Promise<Service | null> {
    const row = await this.prisma.service.findUnique({ where: { id } });

    return row ? ServicePersistenceMapper.toDomain(row) : null;
  }

  async findByName(name: string): Promise<Service | null> {
    const row = await this.prisma.service.findUnique({ where: { name } });

    return row ? ServicePersistenceMapper.toDomain(row) : null;
  }

  async findAll(): Promise<Service[]> {
    const rows = await this.prisma.service.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => ServicePersistenceMapper.toDomain(row));
  }

  async update(service: Service): Promise<Service> {
    try {
      const row = await this.prisma.service.update({
        where: { id: service.getId() },
        data: ServicePersistenceMapper.toUpdate(service),
      });

      return ServicePersistenceMapper.toDomain(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ServiceCatalogApplicationError('SERVICE_ALREADY_EXISTS');
      }

      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    await this.prisma.service.delete({ where: { id } });
  }
}

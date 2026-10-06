import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { Part } from '../../domain/entities/part.entity';
import { StockApplicationError } from '../../application/errors/stock-application.error';
import { PartRepositoryPort } from '../../application/ports/part-repository.port';
import { PartPersistenceMapper } from './part-persistence.mapper';

function hasPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

@Injectable()
export class PrismaPartRepository implements PartRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(part: Part): Promise<Part> {
    try {
      const row = await this.prisma.part.create({
        data: PartPersistenceMapper.toCreate(part),
      });
      return PartPersistenceMapper.toDomain(row);
    } catch (error: unknown) {
      this.translate(error);
    }
  }

  async findById(id: string): Promise<Part | null> {
    const row = await this.prisma.part.findUnique({ where: { id } });
    return row ? PartPersistenceMapper.toDomain(row) : null;
  }

  async findByCode(code: string): Promise<Part | null> {
    const row = await this.prisma.part.findUnique({ where: { code } });
    return row ? PartPersistenceMapper.toDomain(row) : null;
  }

  async findAll(): Promise<Part[]> {
    const rows = await this.prisma.part.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => PartPersistenceMapper.toDomain(row));
  }

  async update(part: Part): Promise<Part> {
    try {
      const row = await this.prisma.part.update({
        where: { id: part.getId() },
        data: PartPersistenceMapper.toUpdate(part),
      });
      return PartPersistenceMapper.toDomain(row);
    } catch (error: unknown) {
      this.translate(error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.part.delete({ where: { id } });
    } catch (error: unknown) {
      this.translate(error);
    }
  }

  /**
   * As pré-checagens do caso de uso existem pela mensagem; a corrida entre
   * consultar e gravar é resolvida pelo banco e traduzida aqui.
   */
  private translate(error: unknown): never {
    if (hasPrismaErrorCode(error, 'P2002')) {
      throw new StockApplicationError('PART_CODE_IN_USE');
    }
    if (hasPrismaErrorCode(error, 'P2025')) {
      throw new StockApplicationError('PART_NOT_FOUND');
    }
    if (hasPrismaErrorCode(error, 'P2003')) {
      throw new StockApplicationError('PART_HAS_LINKS');
    }
    throw error;
  }
}

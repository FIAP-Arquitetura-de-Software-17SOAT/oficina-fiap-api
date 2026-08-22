import { Money as SharedMoney } from '../../../shared/domain/value-objects/money.vo';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { MeasurementUnit, Part, PartType } from '../entities/part.entity';

interface PartRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: string;
  unit: string;
  unitPriceCents: number;
  quantity: number;
  minimumQuantity: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class PartRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(part: Part): Promise<Part> {
    const row = await this.prisma.part.create({
      data: this.toCreatePersistence(part),
    });

    return this.toDomain(row);
  }

  async findById(id: string): Promise<Part | null> {
    const row = await this.prisma.part.findUnique({ where: { id } });

    return row ? this.toDomain(row) : null;
  }

  async findByCode(code: string): Promise<Part | null> {
    const row = await this.prisma.part.findUnique({ where: { code } });

    return row ? this.toDomain(row) : null;
  }

  async findAll(): Promise<Part[]> {
    const rows = await this.prisma.part.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => this.toDomain(row));
  }

  async update(part: Part): Promise<Part> {
    const row = await this.prisma.part.update({
      where: { id: part.getId() },
      data: this.toUpdatePersistence(part),
    });

    return this.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.part.delete({ where: { id } });
  }

  private toCreatePersistence(part: Part) {
    return {
      id: part.getId(),
      code: part.getCode().getValue(),
      name: part.getName(),
      description: part.getDescription(),
      type: part.getType(),
      unit: part.getUnit(),
      unitPriceCents: SharedMoney.fromDecimal(Number(part.getUnitPrice().value))
        .valueInCents,
      quantity: part.getQuantity().getValue(),
      minimumQuantity: part.getMinimumQuantity().getValue(),
      createdAt: part.getCreatedAt(),
      updatedAt: part.getUpdatedAt(),
    };
  }

  private toUpdatePersistence(part: Part) {
    return {
      code: part.getCode().getValue(),
      name: part.getName(),
      description: part.getDescription(),
      type: part.getType(),
      unit: part.getUnit(),
      unitPriceCents: SharedMoney.fromDecimal(Number(part.getUnitPrice().value))
        .valueInCents,
      minimumQuantity: part.getMinimumQuantity().getValue(),
      updatedAt: part.getUpdatedAt(),
    };
  }

  private toDomain(row: PartRow): Part {
    return Part.restore(row.id, {
      code: row.code,
      name: row.name,
      description: row.description ?? undefined,
      type: row.type as PartType,
      unit: row.unit as MeasurementUnit,
      unitPrice: SharedMoney.fromCents(row.unitPriceCents).value,
      quantity: row.quantity,
      minimumQuantity: row.minimumQuantity,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}

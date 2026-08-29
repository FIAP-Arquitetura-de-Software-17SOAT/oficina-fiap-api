import { randomUUID } from 'node:crypto';
import { Money } from '../../../shared/domain/value-objects/money.vo';
import { Injectable } from '@nestjs/common';
import {
  StockMovementType as PrismaStockMovementType,
  type Part as PrismaPart,
} from '../../../../generated/prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { MeasurementUnit, Part, PartType } from '../entities/part.entity';
import { StockMovementType } from '../enums/stock-movement-type.enum';

export { StockMovementType };

export interface ApplyStockMovementInput {
  partId: string;
  type: StockMovementType;
  quantity: number;
  idempotencyKey: string;
}

export interface AppliedStockMovement {
  movement: {
    id: string;
    idempotencyKey: string;
    type: StockMovementType;
    quantity: number;
    partId: string;
    createdAt: Date;
  };
  part: Part;
  replayed: boolean;
}

export class InsufficientStockError extends Error {}
export class IdempotencyConflictError extends Error {}
export class PartNotFoundError extends Error {}

function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

@Injectable()
export class StockMovementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async apply(input: ApplyStockMovementInput): Promise<AppliedStockMovement> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const movement = await transaction.stockMovement.create({
          data: {
            id: randomUUID(),
            idempotencyKey: input.idempotencyKey,
            type: input.type,
            quantity: input.quantity,
            partId: input.partId,
          },
        });

        const changed = await transaction.part.updateMany({
          where:
            input.type === StockMovementType.OUT
              ? { id: input.partId, quantity: { gte: input.quantity } }
              : { id: input.partId },
          data:
            input.type === StockMovementType.OUT
              ? { quantity: { decrement: input.quantity } }
              : { quantity: { increment: input.quantity } },
        });

        if (changed.count === 0) {
          const existing = await transaction.part.findUnique({
            where: { id: input.partId },
          });
          if (!existing) {
            throw new PartNotFoundError('Part not found');
          }
          throw new InsufficientStockError('Insufficient stock');
        }

        const part = await transaction.part.findUnique({
          where: { id: input.partId },
        });

        if (!part) {
          throw new PartNotFoundError('Part not found');
        }

        return {
          movement: this.toMovement(movement),
          part: this.toDomain(part),
          replayed: false,
        };
      });
    } catch (error: unknown) {
      if (!isPrismaError(error, 'P2002')) {
        throw error;
      }
      const replay = await this.findReplay(input);
      if (!replay) {
        throw new IdempotencyConflictError('Idempotency key already in use');
      }
      return replay;
    }
  }

  private async findReplay(
    input: ApplyStockMovementInput,
  ): Promise<AppliedStockMovement | null> {
    const existing = await this.prisma.stockMovement.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });

    if (!existing) {
      return null;
    }

    if (
      existing.partId !== input.partId ||
      existing.type !== input.type ||
      existing.quantity !== input.quantity
    ) {
      throw new IdempotencyConflictError('Idempotency key already in use');
    }

    const part = await this.prisma.part.findUnique({
      where: { id: input.partId },
    });

    if (!part) {
      throw new PartNotFoundError('Part not found');
    }

    return {
      movement: this.toMovement(existing),
      part: this.toDomain(part),
      replayed: true,
    };
  }

  private toMovement(movement: {
    id: string;
    idempotencyKey: string;
    type: PrismaStockMovementType;
    quantity: number;
    partId: string;
    createdAt: Date;
  }) {
    return { ...movement, type: movement.type as StockMovementType };
  }

  private toDomain(row: PrismaPart): Part {
    return Part.restore(row.id, {
      code: row.code,
      name: row.name,
      description: row.description ?? undefined,
      type: row.type as PartType,
      unit: row.unit as MeasurementUnit,
      unitPrice: Money.fromCents(row.unitPriceCents).value,
      quantity: row.quantity,
      minimumQuantity: row.minimumQuantity,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}

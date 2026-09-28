import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { StockMovementType as PrismaStockMovementType } from '../../../../../generated/prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { StockMovementType } from '../../domain/enums/stock-movement-type.enum';
import {
  AppliedStockMovement,
  ApplyStockMovementInput,
} from '../../application/contracts/stock-movement';
import { StockApplicationError } from '../../application/errors/stock-application.error';
import { StockMovementRepositoryPort } from '../../application/ports/stock-movement-repository.port';
import { PartPersistenceMapper } from './part-persistence.mapper';

function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

@Injectable()
export class PrismaStockMovementRepository implements StockMovementRepositoryPort {
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
            throw new StockApplicationError('MOVEMENT_PART_NOT_FOUND');
          }
          throw new StockApplicationError('INSUFFICIENT_STOCK');
        }

        const part = await transaction.part.findUnique({
          where: { id: input.partId },
        });

        if (!part) {
          throw new StockApplicationError('MOVEMENT_PART_NOT_FOUND');
        }

        return {
          movement: this.toMovement(movement),
          part: PartPersistenceMapper.toDomain(part),
          replayed: false,
        };
      });
    } catch (error: unknown) {
      if (!isPrismaError(error, 'P2002')) {
        throw error;
      }
      const replay = await this.findReplay(input);
      if (!replay) {
        throw new StockApplicationError('IDEMPOTENCY_KEY_CONFLICT');
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
      throw new StockApplicationError('IDEMPOTENCY_KEY_CONFLICT');
    }

    const part = await this.prisma.part.findUnique({
      where: { id: input.partId },
    });

    if (!part) {
      throw new StockApplicationError('MOVEMENT_PART_NOT_FOUND');
    }

    return {
      movement: this.toMovement(existing),
      part: PartPersistenceMapper.toDomain(part),
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
}

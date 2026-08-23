import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateStockMovementDto } from '../dto/stock-movement.dto';
import {
  AppliedStockMovement,
  IdempotencyConflictError,
  InsufficientStockError,
  PartNotFoundError,
  StockMovementRepository,
  StockMovementType,
} from '../repositories/stock-movement.repository';

@Injectable()
export class StockMovementService {
  constructor(
    private readonly stockMovementRepository: StockMovementRepository,
  ) {}

  async increase(
    partId: string,
    dto: CreateStockMovementDto,
  ): Promise<AppliedStockMovement> {
    return this.apply(partId, StockMovementType.IN, dto);
  }

  async decrease(
    partId: string,
    dto: CreateStockMovementDto,
  ): Promise<AppliedStockMovement> {
    return this.apply(partId, StockMovementType.OUT, dto);
  }

  private async apply(
    partId: string,
    type: StockMovementType,
    dto: CreateStockMovementDto,
  ): Promise<AppliedStockMovement> {
    if (!Number.isSafeInteger(dto.quantity) || dto.quantity <= 0) {
      throw new BadRequestException(
        'Movement quantity must be a positive integer',
      );
    }

    if (!dto.idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency key is required');
    }

    try {
      return await this.stockMovementRepository.apply({
        partId,
        type,
        quantity: dto.quantity,
        idempotencyKey: dto.idempotencyKey.trim(),
      });
    } catch (error: unknown) {
      if (error instanceof InsufficientStockError) {
        throw new ConflictException('Insufficient stock');
      }
      if (error instanceof IdempotencyConflictError) {
        throw new ConflictException('Idempotency key already in use');
      }
      if (error instanceof PartNotFoundError) {
        throw new NotFoundException('Part not found');
      }
      throw error;
    }
  }
}

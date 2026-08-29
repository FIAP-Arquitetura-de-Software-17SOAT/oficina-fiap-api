import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreatePartDto, UpdatePartDto } from '../dto/part.dto';
import { Part } from '../entities/part.entity';
import { PartRepository } from '../repositories/part.repository';
import { PartCode } from '../value-objects/part-code.vo';

function hasPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

@Injectable()
export class PartService {
  constructor(private readonly partRepository: PartRepository) {}

  async create(dto: CreatePartDto): Promise<Part> {
    const part = Part.create({ ...dto, quantity: 0 });
    await this.assertCodeIsAvailable(part.getCode());

    try {
      return await this.partRepository.create(part);
    } catch (error: unknown) {
      this.rethrowWriteError(error);
    }
  }

  async findById(id: string): Promise<Part> {
    const part = await this.partRepository.findById(id);

    if (!part) {
      throw new NotFoundException('Peça não encontrada');
    }

    return part;
  }

  async findAll(): Promise<Part[]> {
    return this.partRepository.findAll();
  }

  async update(id: string, dto: UpdatePartDto): Promise<Part> {
    const part = await this.findById(id);

    if (dto.code !== undefined) {
      const code = PartCode.create(dto.code);
      await this.assertCodeIsAvailable(code, id);
      dto = { ...dto, code: code.getValue() };
    }

    part.update(dto);

    try {
      return await this.partRepository.update(part);
    } catch (error: unknown) {
      this.rethrowWriteError(error);
    }
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);

    try {
      await this.partRepository.delete(id);
    } catch (error: unknown) {
      this.rethrowWriteError(error);
    }
  }

  private async assertCodeIsAvailable(
    code: PartCode,
    allowedPartId?: string,
  ): Promise<void> {
    const existing = await this.partRepository.findByCode(code.getValue());

    if (existing && existing.getId() !== allowedPartId) {
      throw new ConflictException('Código da peça já cadastrado');
    }
  }

  private rethrowWriteError(error: unknown): never {
    if (hasPrismaErrorCode(error, 'P2002')) {
      throw new ConflictException('Código da peça já cadastrado');
    }

    if (hasPrismaErrorCode(error, 'P2025')) {
      throw new NotFoundException('Peça não encontrada');
    }

    // P2003: a peça ainda é referenciada por movimentação de estoque, item de
    // orçamento ou item de pedido de compra — todas as relações são Restrict de
    // propósito, para não levar o histórico junto. Sem esta tradução o Prisma
    // sobe cru e vira 500, quando o caso é conflito de dados.
    if (hasPrismaErrorCode(error, 'P2003')) {
      throw new ConflictException(
        'Peça possui movimentações, orçamentos ou pedidos de compra vinculados e não pode ser removida',
      );
    }

    throw error;
  }
}

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreatePartDto, UpdatePartDto } from '../dto/part.dto';
import { Part } from '../entities/part.entity';
import { PartRepository } from '../repositories/part.repository';
import { PartCode } from '../value-objects/part-code';

@Injectable()
export class PartService {
  constructor(private readonly partRepository: PartRepository) {}

  async create(dto: CreatePartDto): Promise<Part> {
    const part = Part.create(dto);
    await this.assertCodeIsAvailable(part.getCode());

    return this.partRepository.create(part);
  }

  async findById(id: string): Promise<Part> {
    const part = await this.partRepository.findById(id);

    if (!part) {
      throw new NotFoundException('Part not found');
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

    return this.partRepository.update(part);
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);
    await this.partRepository.delete(id);
  }

  private async assertCodeIsAvailable(
    code: PartCode,
    allowedPartId?: string,
  ): Promise<void> {
    const existing = await this.partRepository.findByCode(code.getValue());

    if (existing && existing.getId() !== allowedPartId) {
      throw new ConflictException('Part code already in use');
    }
  }
}

import { PartResponseDto } from '../dto/part.dto';
import { Part } from '../../../domain/entities/part.entity';

export class PartResponseMapper {
  static toResponse(part: Part): PartResponseDto {
    return {
      id: part.getId(),
      code: part.getCode().getValue(),
      name: part.getName(),
      description: part.getDescription(),
      type: part.getType(),
      unit: part.getUnit(),
      unitPrice: part.getUnitPrice().value,
      quantity: part.getQuantity().getValue(),
      minimumQuantity: part.getMinimumQuantity().getValue(),
      createdAt: part.getCreatedAt(),
      updatedAt: part.getUpdatedAt(),
    };
  }

  static toResponseList(parts: Part[]): PartResponseDto[] {
    return parts.map((part) => PartResponseMapper.toResponse(part));
  }
}

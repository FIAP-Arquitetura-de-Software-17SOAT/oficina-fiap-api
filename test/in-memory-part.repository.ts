import {
  MeasurementUnit,
  Part,
  PartType,
} from '../src/modules/stock/entities/part.entity';

export class InMemoryPartRepository {
  private readonly parts = new Map<string, Part>();

  /**
   * Semeia uma peça sem passar pelo HTTP. `POST /parts` tem guard próprio de
   * controller, que o `allowAuthenticated` não alcança, e quem só precisa de um
   * `partId` válido para orçar não deveria ter que autenticar para isso.
   */
  seed(overrides: Partial<Parameters<typeof Part.create>[0]> = {}): Part {
    const part = Part.create({
      code: 'OIL-FILTER-123',
      name: 'Filtro de óleo',
      type: PartType.PART,
      unit: MeasurementUnit.UNIT,
      unitPrice: 40,
      quantity: 10,
      minimumQuantity: 1,
      ...overrides,
    });

    this.parts.set(part.getId(), part);
    return part;
  }

  create(part: Part): Promise<Part> {
    this.parts.set(part.getId(), part);
    return Promise.resolve(part);
  }

  findById(id: string): Promise<Part | null> {
    return Promise.resolve(this.parts.get(id) ?? null);
  }

  findByCode(code: string): Promise<Part | null> {
    return Promise.resolve(
      this.all().find((part) => part.getCode().getValue() === code) ?? null,
    );
  }

  findAll(): Promise<Part[]> {
    return Promise.resolve(this.all());
  }

  update(part: Part): Promise<Part> {
    this.parts.set(part.getId(), part);
    return Promise.resolve(part);
  }

  delete(id: string): Promise<void> {
    this.parts.delete(id);
    return Promise.resolve();
  }

  private all(): Part[] {
    return Array.from(this.parts.values());
  }
}

import { Part } from '../src/modules/stock/entities/part.entity';

export class InMemoryPartRepository {
  private readonly parts = new Map<string, Part>();

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

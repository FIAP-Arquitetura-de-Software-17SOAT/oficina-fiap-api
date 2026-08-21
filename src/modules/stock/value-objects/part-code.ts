import { DomainException } from '../../../shared/domain/domain.exception';

export class PartCode {
  private constructor(private readonly value: string) {}

  static create(input: string): PartCode {
    const value = (input ?? '').trim().toUpperCase();

    if (!value) {
      throw new DomainException('Código da peça é obrigatório');
    }

    return new PartCode(value);
  }

  getValue(): string {
    return this.value;
  }

  equals(other: PartCode): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

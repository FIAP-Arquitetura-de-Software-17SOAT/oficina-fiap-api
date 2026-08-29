import { DomainException } from '../../../shared/domain/domain.exception';

const PART_CODE_PATTERN = /^[A-Z0-9._-]+$/;

export class PartCode {
  private constructor(private readonly value: string) {}

  static create(input: string): PartCode {
    const value = (input ?? '').trim().toUpperCase();

    if (!value) {
      throw new DomainException('Código da peça é obrigatório');
    }

    if (!PART_CODE_PATTERN.test(value)) {
      throw new DomainException(
        'Codigo da peca deve conter apenas letras, numeros, ponto, hifen ou sublinhado',
      );
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

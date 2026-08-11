import { DomainException } from '../../../shared/domain/domain.exception';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export class Email {
  private constructor(private readonly value: string) {}

  static create(input: string): Email {
    const normalized = (input ?? '').trim().toLowerCase();

    if (!EMAIL_PATTERN.test(normalized)) {
      throw new DomainException('E-mail inválido');
    }

    return new Email(normalized);
  }

  getValue(): string {
    return this.value;
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

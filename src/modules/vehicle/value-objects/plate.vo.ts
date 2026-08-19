import { DomainException } from '../../../shared/domain/domain.exception';

/** Formato anterior ao Mercosul: três letras e quatro dígitos (ABC1234). */
const FORMATO_ANTIGO = /^[A-Z]{3}\d{4}$/;

/** Formato Mercosul: três letras, dígito, letra e dois dígitos (ABC1D23). */
const FORMATO_MERCOSUL = /^[A-Z]{3}\d[A-Z]\d{2}$/;

/**
 * Placa do veículo. Identifica o veículo no domínio, então é imutável e única.
 * Aceita com hífen, espaço ou minúsculas e persiste sempre normalizada.
 */
export class Plate {
  private constructor(private readonly value: string) {}

  static create(input: string): Plate {
    const normalized = (input ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    if (
      !FORMATO_ANTIGO.test(normalized) &&
      !FORMATO_MERCOSUL.test(normalized)
    ) {
      throw new DomainException('Placa inválida');
    }

    return new Plate(normalized);
  }

  getValue(): string {
    return this.value;
  }

  isMercosul(): boolean {
    return FORMATO_MERCOSUL.test(this.value);
  }

  equals(other: Plate): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

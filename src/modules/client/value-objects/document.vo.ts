import { DomainException } from '../../../shared/domain/domain.exception';

const CPF_LENGTH = 11;
const CNPJ_LENGTH = 14;

function hasRepeatedDigits(digits: string): boolean {
  return new Set(digits).size === 1;
}

function checkDigit(digits: string, weights: number[]): number {
  const sum = weights.reduce(
    (acc, weight, index) => acc + Number(digits[index]) * weight,
    0,
  );
  const remainder = sum % 11;

  return remainder < 2 ? 0 : 11 - remainder;
}

function isValidCpf(digits: string): boolean {
  if (digits.length !== CPF_LENGTH || hasRepeatedDigits(digits)) {
    return false;
  }

  const first = checkDigit(digits, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(digits, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);

  return Number(digits[9]) === first && Number(digits[10]) === second;
}

function isValidCnpj(digits: string): boolean {
  if (digits.length !== CNPJ_LENGTH || hasRepeatedDigits(digits)) {
    return false;
  }

  const first = checkDigit(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return Number(digits[12]) === first && Number(digits[13]) === second;
}

/**
 * Documento de identificação do cliente.
 *
 * O termo canônico do domínio é **Documento**, e é esse o nome do tipo — não
 * `CpfCnpj`. CPF e CNPJ são os dois formatos que o documento aceita: detalhe de
 * validação, não conceito. Nomear a classe pelo formato faria o mesmo conceito
 * ter dois nomes na mesma assinatura, como em `getDocument(): CpfCnpj`.
 *
 * Imutável, sem identidade própria e impossível de existir em estado inválido.
 */
export class Document {
  private constructor(private readonly value: string) {}

  static create(input: string): Document {
    const digits = (input ?? '').replace(/\D/g, '');

    if (!isValidCpf(digits) && !isValidCnpj(digits)) {
      throw new DomainException('CPF/CNPJ inválido');
    }

    return new Document(digits);
  }

  getValue(): string {
    return this.value;
  }

  isLegalEntity(): boolean {
    return this.value.length === CNPJ_LENGTH;
  }

  equals(other: Document): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

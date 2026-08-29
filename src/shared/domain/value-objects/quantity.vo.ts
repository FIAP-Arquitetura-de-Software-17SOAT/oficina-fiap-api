import { DomainException } from '../domain.exception';

/**
 * Quantidade de peça ou insumo, sempre inteira (§9 da linguagem ubíqua).
 *
 * O domínio tem duas leituras de quantidade e elas não têm a mesma invariante:
 *
 * - **saldo** (o que existe na prateleira): pode ser zero, só não pode ficar
 *   negativo — regra 18. Use `Quantity.create`.
 * - **movimento** (entrada, saída, item de pedido ou de orçamento): tem que ser
 *   maior que zero, porque movimentar nada não é um fato — regra 17. Use
 *   `Quantity.positive`.
 *
 * Antes existiam duas classes `Quantity`, uma em `stock` e outra em
 * `purchase-order`, com invariantes e acessores diferentes. Duas classes com o
 * mesmo nome para o mesmo conceito é exatamente o sinônimo que a §11 proíbe:
 * aqui é uma classe só, e a diferença fica no construtor nomeado.
 */
export class Quantity {
  private constructor(private readonly value: number) {}

  /** Saldo em estoque. Aceita zero, recusa negativo (regra 18). */
  static create(input: number): Quantity {
    if (!Number.isSafeInteger(input)) {
      throw new DomainException('A quantidade deve ser um número inteiro');
    }

    if (input < 0) {
      throw new DomainException('A quantidade não pode ser negativa');
    }

    return new Quantity(input);
  }

  /** Quantidade movimentada. Recusa zero e negativo (regra 17). */
  static positive(input: number): Quantity {
    const quantity = Quantity.create(input);

    if (quantity.value === 0) {
      throw new DomainException('A quantidade deve ser maior que zero');
    }

    return quantity;
  }

  static zero(): Quantity {
    return new Quantity(0);
  }

  add(other: Quantity): Quantity {
    return Quantity.create(this.value + other.value);
  }

  /** Lança quando o saldo ficaria negativo, em vez de devolver um número ruim. */
  subtract(other: Quantity): Quantity {
    return Quantity.create(this.value - other.value);
  }

  isAtLeast(other: Quantity): boolean {
    return this.value >= other.value;
  }

  isZero(): boolean {
    return this.value === 0;
  }

  equals(other: Quantity): boolean {
    return this.value === other.value;
  }

  getValue(): number {
    return this.value;
  }
}

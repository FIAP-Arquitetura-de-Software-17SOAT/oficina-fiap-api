/**
 * Erro de regra de negócio. Diferente de um erro técnico: significa que o
 * domínio recusou a operação, então a resposta HTTP é 400 e não 500.
 */
export class DomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainException';
  }
}

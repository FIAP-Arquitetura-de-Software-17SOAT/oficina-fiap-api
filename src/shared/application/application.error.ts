/**
 * Categoria semântica de um erro de aplicação. Não é status HTTP: quem
 * decide o status é o filtro na borda (`ApplicationExceptionFilter`).
 */
export type ApplicationErrorKind =
  'NOT_FOUND' | 'CONFLICT' | 'GONE' | 'INVALID' | 'UNAUTHORIZED' | 'FORBIDDEN';

/**
 * Base dos erros lançados pelos casos de uso. Cada módulo define a própria
 * subclasse com os seus códigos (`ClientApplicationError`, ...), o que mantém
 * o código tipado por módulo e um único filtro HTTP para todos.
 */
export abstract class ApplicationError extends Error {
  protected constructor(
    readonly code: string,
    readonly kind: ApplicationErrorKind,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

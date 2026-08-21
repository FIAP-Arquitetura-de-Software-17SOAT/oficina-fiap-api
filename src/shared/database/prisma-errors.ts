/**
 * Tradução dos códigos de erro do Prisma. Sem isso eles sobem como 500:
 * violar uma constraint é conflito de dados, não falha do servidor.
 *
 * Referência: https://www.prisma.io/docs/orm/reference/error-reference
 */

interface PrismaKnownError {
  code?: string;
  meta?: { target?: unknown };
}

function asKnownError(error: unknown): PrismaKnownError | null {
  return typeof error === 'object' && error !== null ? error : null;
}

/** P2002 — constraint de unicidade violada. */
export function isUniqueViolation(error: unknown): boolean {
  return asKnownError(error)?.code === 'P2002';
}

/** P2003 — chave estrangeira violada. */
export function isForeignKeyViolation(error: unknown): boolean {
  return asKnownError(error)?.code === 'P2003';
}

/**
 * Colunas envolvidas na violação de unicidade. Permite responder qual campo
 * duplicou em tabelas com mais de uma constraint única.
 */
export function uniqueViolationFields(error: unknown): string[] {
  const target = asKnownError(error)?.meta?.target;

  if (Array.isArray(target)) {
    return target.filter((field): field is string => typeof field === 'string');
  }

  return typeof target === 'string' ? [target] : [];
}

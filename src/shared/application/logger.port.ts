/**
 * Registro de erro que a aplicação precisa fazer sem conhecer o logger do
 * framework. Só o que os casos de uso usam hoje: erro com contexto estruturado.
 */
export abstract class LoggerPort {
  abstract error(details: Record<string, unknown>, message: string): void;
}

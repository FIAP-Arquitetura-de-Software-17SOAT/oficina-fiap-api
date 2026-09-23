/**
 * Porta pela qual a abertura da OS confere que a peça pedida existe.
 *
 * As outras integrações do projeto chamam o controller do módulo alvo direto.
 * Aqui não dá: o estoque já importa a OS (o despacho de peças a move para
 * execução), e importar o PartController de volta fechava um ciclo de arquivos
 * que deixava classes indefinidas na injeção. A OS declara o que precisa e o
 * estoque fornece — ver StockModule.
 */
export const PART_CATALOG = Symbol('PART_CATALOG');

export interface PartCatalog {
  /** Lança NotFoundException quando a peça não existe. */
  findById(id: string): Promise<unknown>;
}

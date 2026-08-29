/**
 * Item de orçamento é serviço ou peça/insumo (§3). Só o item de peça é baixado
 * do estoque; serviço é trabalho executado pela oficina.
 */
export enum BudgetItemType {
  SERVICE = 'SERVICE',
  PART = 'PART',
}

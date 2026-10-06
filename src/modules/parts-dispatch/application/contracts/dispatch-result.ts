export interface PartRequirement {
  partId: string;
  partName: string;
  /** Quantidade que o orçamento aceito exige, arredondada para cima. */
  required: number;
  /** Saldo no momento da consulta. */
  available: number;
}

export interface DispatchResult {
  serviceOrderId: string;
  /** true: estoque baixado e OS liberada. false: faltou peça, pedido aberto. */
  dispatched: boolean;
  purchaseOrderId: string | null;
  requirements: PartRequirement[];
}

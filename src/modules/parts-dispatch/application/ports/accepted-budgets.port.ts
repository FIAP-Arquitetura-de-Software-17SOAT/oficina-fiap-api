export interface AcceptedBudgetPartItem {
  /** Nulo só em linha anterior à migration que passou a exigir a referência. */
  partId: string | null;
  description: string;
  quantity: number;
}

export interface AcceptedBudget {
  id: string;
  version: number;
  partItems: AcceptedBudgetPartItem[];
}

/** O que o despacho precisa do orçamento: só os aceitos, só os itens de peça. */
export abstract class AcceptedBudgetsPort {
  abstract findAccepted(serviceOrderId: string): Promise<AcceptedBudget[]>;
}

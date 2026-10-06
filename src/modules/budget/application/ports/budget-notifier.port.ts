export interface BudgetReadyNotice {
  serviceOrderId: string;
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }[];
  total: number;
  /** Token do link pessoal; o adapter monta a URL. */
  approvalToken: string;
  approvalExpiresAt: Date;
}

export interface StockPartsRequestedNotice {
  serviceOrderId: string;
  parts: { description: string; quantity: number }[];
}

/**
 * Avisos de negócio do orçamento. O adapter resolve destinatários, URL e
 * templates, e nunca lança: o envio e o aceite já foram gravados.
 */
export abstract class BudgetNotifierPort {
  abstract budgetReady(notice: BudgetReadyNotice): Promise<void>;
  abstract stockPartsRequested(
    notice: StockPartsRequestedNotice,
  ): Promise<void>;
}

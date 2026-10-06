/** O que a cobrança precisa da OS: dono (para o aviso) e status (para cobrar e entregar). */
export interface ServiceOrderSummary {
  id: string;
  clientId: string;
  status: string;
}

export abstract class ServiceOrderPort {
  abstract findById(
    serviceOrderId: string,
  ): Promise<ServiceOrderSummary | null>;
  /** Cliente abandonou o checkout: a OS passa a dizer "cobrança em aberto". */
  abstract awaitPayment(serviceOrderId: string): Promise<ServiceOrderSummary>;
  /** Cobrança quitada: a OS é entregue. */
  abstract deliver(serviceOrderId: string): Promise<ServiceOrderSummary>;
}

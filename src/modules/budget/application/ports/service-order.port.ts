/** O que o orçamento precisa da OS: dono (para o recorte) e status (para aceitar proposta nova). */
export interface ServiceOrderSummary {
  id: string;
  clientId: string;
  status: string;
}

export abstract class ServiceOrderPort {
  abstract findById(
    serviceOrderId: string,
  ): Promise<ServiceOrderSummary | null>;
  /** Política: "quando o orçamento for gerado, a OS vai para aguardando aprovação". */
  abstract awaitApproval(serviceOrderId: string): Promise<void>;
  /** Política: "quando o orçamento for aceito, as peças são solicitadas". */
  abstract awaitParts(serviceOrderId: string): Promise<void>;
}

export interface StatusChangedNotice {
  clientId: string;
  serviceOrderId: string;
  status: string;
  cancellationReason: string | null;
}

/**
 * Aviso ao cliente de que a OS mudou de status. O adapter resolve o e-mail do
 * cliente, monta a mensagem e nunca lança: a transição já foi gravada e o
 * aviso é consequência, não condição.
 */
export abstract class ServiceOrderNotifierPort {
  abstract statusChanged(notice: StatusChangedNotice): Promise<void>;
}

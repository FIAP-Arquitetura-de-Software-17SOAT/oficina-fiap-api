export interface PaymentLinkReadyNotice {
  serviceOrderId: string;
  total: number;
  paymentLink: string;
}

/**
 * Aviso de negócio da cobrança. O adapter resolve o destinatário e o
 * template, e nunca lança: a cobrança e o link já foram gravados.
 */
export abstract class BillingNotifierPort {
  abstract paymentLinkReady(notice: PaymentLinkReadyNotice): Promise<void>;
}

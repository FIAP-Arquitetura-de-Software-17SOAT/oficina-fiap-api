import { Injectable } from '@nestjs/common';
import { FindClientUseCase } from '../../../client/application/use-cases/find-client.use-case';
import { EnqueueNotificationUseCase } from '../../../notification/application/use-cases/enqueue-notification.use-case';
import { NotificationType } from '../../../notification/domain/enums/notification-type.enum';
import { FindServiceOrderUseCase } from '../../../service-order/application/use-cases/find-service-order.use-case';
import {
  BillingNotifierPort,
  PaymentLinkReadyNotice,
} from '../../application/ports/billing-notifier.port';
import { paymentLinkReadyEmail } from './payment-link-ready.email';

/**
 * Resolve o e-mail do cliente (OS → cliente), monta a mensagem e enfileira.
 * Nunca lança: a cobrança e o link já foram persistidos, e o módulo de
 * notificação guarda a falha para reenvio.
 */
@Injectable()
export class BillingNotifierAdapter implements BillingNotifierPort {
  constructor(
    private readonly findServiceOrder: FindServiceOrderUseCase,
    private readonly findClient: FindClientUseCase,
    private readonly notifications: EnqueueNotificationUseCase,
  ) {}

  async paymentLinkReady(notice: PaymentLinkReadyNotice): Promise<void> {
    try {
      const serviceOrder = await this.findServiceOrder.execute(
        notice.serviceOrderId,
      );
      const client = await this.findClient.execute(serviceOrder.getClientId());

      await this.notifications.execute({
        type: NotificationType.PAYMENT_LINK_READY,
        to: client.getEmail().getValue(),
        ...paymentLinkReadyEmail(notice),
      });
    } catch {
      // Falha de notificação não altera o resultado de negócio já gravado.
    }
  }
}

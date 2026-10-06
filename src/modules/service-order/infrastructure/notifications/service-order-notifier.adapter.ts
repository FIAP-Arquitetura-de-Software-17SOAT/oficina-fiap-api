import { Injectable } from '@nestjs/common';
import { FindClientUseCase } from '../../../client/application/use-cases/find-client.use-case';
import { NotificationType } from '../../../notification/domain/enums/notification-type.enum';
import { EnqueueNotificationUseCase } from '../../../notification/application/use-cases/enqueue-notification.use-case';
import {
  ServiceOrderNotifierPort,
  StatusChangedNotice,
} from '../../application/ports/service-order-notifier.port';
import { serviceOrderStatusChangedEmail } from './service-order-status-changed.email';

/**
 * Resolve o e-mail do cliente, monta a mensagem e enfileira. Nunca lança: a
 * transição já foi gravada, e o módulo de notificação guarda a falha de envio
 * para reenvio manual.
 */
@Injectable()
export class ServiceOrderNotifierAdapter implements ServiceOrderNotifierPort {
  constructor(
    private readonly findClient: FindClientUseCase,
    private readonly notifications: EnqueueNotificationUseCase,
  ) {}

  async statusChanged(notice: StatusChangedNotice): Promise<void> {
    try {
      const client = await this.findClient.execute(notice.clientId);

      await this.notifications.execute({
        type: NotificationType.SERVICE_ORDER_STATUS_CHANGED,
        to: client.getEmail().getValue(),
        ...serviceOrderStatusChangedEmail({
          serviceOrderId: notice.serviceOrderId,
          status: notice.status,
          cancellationReason: notice.cancellationReason,
        }),
      });
    } catch {
      // A transição já foi gravada; o aviso é consequência, não condição.
    }
  }
}

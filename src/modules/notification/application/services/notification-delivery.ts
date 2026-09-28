import { LoggerPort } from '../../../../shared/application/logger.port';
import { Notification } from '../../domain/entities/notification.entity';
import { NotificationStatus } from '../../domain/enums/notification-status.enum';
import { NotificationApplicationError } from '../errors/notification-application.error';
import { EmailSenderPort } from '../ports/email-sender.port';
import { NotificationRepositoryPort } from '../ports/notification-repository.port';

/**
 * Entrega e persistência de estado compartilhadas entre o envio inicial e o
 * reenvio. Não é caso de uso: é o colaborador que os dois usam.
 *
 * `isExplicitRetry` muda quem lida com falha de persistência: no envio
 * inicial ninguém está esperando (é fire-and-forget), então o erro vira log;
 * no reenvio há um operador esperando resposta, então o erro sobe.
 */
export class NotificationDelivery {
  constructor(
    private readonly notifications: NotificationRepositoryPort,
    private readonly email: EmailSenderPort,
    private readonly logger: LoggerPort,
  ) {}

  async findById(id: string): Promise<Notification> {
    const notification = await this.notifications.findById(id);
    if (!notification) {
      throw new NotificationApplicationError('NOTIFICATION_NOT_FOUND');
    }
    return notification;
  }

  async deliver(
    notification: Notification,
    isExplicitRetry: boolean,
  ): Promise<Notification> {
    try {
      await this.email.send({
        to: notification.getTo(),
        subject: notification.getSubject(),
        text: notification.getText(),
        html: notification.getHtml(),
      });
    } catch (error) {
      this.logger.error(
        { err: error, notificationId: notification.getId() },
        'Notification delivery failed',
      );
      try {
        return await this.persist(notification, isExplicitRetry, (current) =>
          current.markFailed(
            error instanceof Error
              ? error
              : new Error('Notification delivery failed'),
          ),
        );
      } catch (persistError) {
        if (isExplicitRetry) throw persistError;
        this.logger.error(
          { err: persistError, notificationId: notification.getId() },
          'Notification failure state could not be persisted',
        );
        return notification;
      }
    }

    try {
      return await this.persist(notification, isExplicitRetry, (current) =>
        current.markSent(),
      );
    } catch (error) {
      if (isExplicitRetry) throw error;
      this.logger.error(
        { err: error, notificationId: notification.getId() },
        'Notification sent state could not be persisted',
      );
      return notification;
    }
  }

  async persist(
    notification: Notification,
    isExplicitRetry: boolean,
    mutate: (notification: Notification) => void,
  ): Promise<Notification> {
    const expectedUpdatedAt = new Date(notification.getUpdatedAt());
    mutate(notification);
    const updated = await this.notifications.update(
      notification,
      expectedUpdatedAt,
    );
    if (updated) return updated;

    if (!isExplicitRetry) {
      throw new NotificationApplicationError('NOTIFICATION_CONCURRENT_UPDATE');
    }

    // No reenvio, perder a corrida para um envio que deu certo não é erro.
    const current = await this.findById(notification.getId());
    if (current.getStatus() === NotificationStatus.SENT) return current;
    throw new NotificationApplicationError('NOTIFICATION_CONCURRENT_UPDATE');
  }
}

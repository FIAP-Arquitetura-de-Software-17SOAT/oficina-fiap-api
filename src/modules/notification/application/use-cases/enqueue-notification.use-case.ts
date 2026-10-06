import { LoggerPort } from '../../../../shared/application/logger.port';
import { Notification } from '../../domain/entities/notification.entity';
import { CreateNotificationInput } from '../contracts/notification.input';
import { EmailSenderPort } from '../ports/email-sender.port';
import { NotificationRepositoryPort } from '../ports/notification-repository.port';
import { NotificationDelivery } from '../services/notification-delivery';

/**
 * Registra e envia uma notificação sem nunca rejeitar quem chamou: falha de
 * e-mail não pode desfazer a transição de negócio que a disparou. O estado
 * fica gravado para o reenvio manual.
 */
export class EnqueueNotificationUseCase {
  private readonly delivery: NotificationDelivery;

  constructor(
    private readonly notifications: NotificationRepositoryPort,
    email: EmailSenderPort,
    private readonly logger: LoggerPort,
  ) {
    this.delivery = new NotificationDelivery(notifications, email, logger);
  }

  async execute(input: CreateNotificationInput): Promise<void> {
    try {
      const notification = await this.notifications.create(
        Notification.create(input),
      );
      await this.delivery.deliver(notification, false);
    } catch (error) {
      this.logger.error(
        { err: error, type: input.type },
        'Notification enqueue failed',
      );
    }
  }
}

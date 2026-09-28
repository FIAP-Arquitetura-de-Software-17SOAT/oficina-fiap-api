import { LoggerPort } from '../../../../shared/application/logger.port';
import { Notification } from '../../domain/entities/notification.entity';
import { NotificationStatus } from '../../domain/enums/notification-status.enum';
import { NotificationApplicationError } from '../errors/notification-application.error';
import { EmailSenderPort } from '../ports/email-sender.port';
import { NotificationRepositoryPort } from '../ports/notification-repository.port';
import { NotificationDelivery } from '../services/notification-delivery';

export class RetryNotificationUseCase {
  private readonly delivery: NotificationDelivery;

  constructor(
    notifications: NotificationRepositoryPort,
    email: EmailSenderPort,
    logger: LoggerPort,
  ) {
    this.delivery = new NotificationDelivery(notifications, email, logger);
  }

  async execute(id: string): Promise<Notification> {
    const notification = await this.delivery.findById(id);
    if (notification.getStatus() !== NotificationStatus.FAILED) {
      throw new NotificationApplicationError('NOTIFICATION_NOT_FAILED');
    }

    const pending = await this.delivery.persist(notification, true, (current) =>
      current.prepareRetry(),
    );
    return this.delivery.deliver(pending, true);
  }
}

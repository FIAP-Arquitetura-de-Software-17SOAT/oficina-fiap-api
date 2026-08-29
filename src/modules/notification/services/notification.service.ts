import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EmailSender } from '../../../shared/notifications/email/email-sender';
import { Notification } from '../entities/notification.entity';
import { NotificationStatus } from '../enums/notification-status.enum';
import { NotificationType } from '../enums/notification-type.enum';
import {
  NotificationFilters,
  NotificationRepository,
} from '../repositories/notification.repository';

export interface CreateNotificationInput {
  type: NotificationType;
  to: string;
  subject: string;
  text: string;
  html: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly emailSender: EmailSender,
  ) {}

  async enqueue(input: CreateNotificationInput): Promise<void> {
    try {
      const notification = await this.notificationRepository.create(
        Notification.create(input),
      );
      await this.deliver(notification, false);
    } catch (error) {
      this.logger.error(
        { err: error, type: input.type },
        'Notification enqueue failed',
      );
    }
  }

  async findAll(filters: NotificationFilters = {}): Promise<Notification[]> {
    return this.notificationRepository.findAll(filters);
  }

  async retry(id: string): Promise<Notification> {
    const notification = await this.findById(id);
    if (notification.getStatus() !== NotificationStatus.FAILED) {
      throw new ConflictException(
        'Somente notificação que falhou pode ser reenviada',
      );
    }

    const pending = await this.persist(notification, true, (current) =>
      current.prepareRetry(),
    );
    return this.deliver(pending, true);
  }

  private async findById(id: string): Promise<Notification> {
    const notification = await this.notificationRepository.findById(id);
    if (!notification)
      throw new NotFoundException('Notificação não encontrada');
    return notification;
  }

  private async deliver(
    notification: Notification,
    isExplicitRetry: boolean,
  ): Promise<Notification> {
    try {
      await this.emailSender.send({
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

  private async persist(
    notification: Notification,
    isExplicitRetry: boolean,
    mutate: (notification: Notification) => void,
  ): Promise<Notification> {
    const expectedUpdatedAt = new Date(notification.getUpdatedAt());
    mutate(notification);
    const updated = await this.notificationRepository.update(
      notification,
      expectedUpdatedAt,
    );
    if (updated) return updated;

    if (!isExplicitRetry) {
      throw new Error('A notificação foi alterada por outro envio');
    }

    const current = await this.findById(notification.getId());
    if (current.getStatus() === NotificationStatus.SENT) return current;
    throw new ConflictException('A notificação foi alterada por outro envio');
  }
}

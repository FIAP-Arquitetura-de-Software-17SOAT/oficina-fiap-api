import { Notification } from '../../domain/entities/notification.entity';
import { NotificationStatus } from '../../domain/enums/notification-status.enum';
import { NotificationType } from '../../domain/enums/notification-type.enum';

export type NotificationRecord = {
  id: string;
  type: NotificationType | string;
  status: NotificationStatus | string;
  to: string;
  subject: string;
  text: string;
  html: string;
  attempts: number;
  lastError: string | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export class NotificationPersistenceMapper {
  static toPersistence(notification: Notification) {
    return {
      id: notification.getId(),
      type: notification.getType(),
      status: notification.getStatus(),
      to: notification.getTo(),
      subject: notification.getSubject(),
      text: notification.getText(),
      html: notification.getHtml(),
      attempts: notification.getAttempts(),
      lastError: notification.getLastError(),
      sentAt: notification.getSentAt(),
      createdAt: notification.getCreatedAt(),
      updatedAt: notification.getUpdatedAt(),
    };
  }

  static toDomain(record: NotificationRecord): Notification {
    return Notification.restore(record.id, {
      type: record.type as NotificationType,
      status: record.status as NotificationStatus,
      to: record.to,
      subject: record.subject,
      text: record.text,
      html: record.html,
      attempts: record.attempts,
      lastError: record.lastError,
      sentAt: record.sentAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}

import { NotificationResponseDto } from '../dto/notification.dto';
import { Notification } from '../../../domain/entities/notification.entity';

export class NotificationResponseMapper {
  static toResponse(notification: Notification): NotificationResponseDto {
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

  static toResponseList(
    notifications: Notification[],
  ): NotificationResponseDto[] {
    return notifications.map((notification) =>
      NotificationResponseMapper.toResponse(notification),
    );
  }
}

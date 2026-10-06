import { NotificationStatus } from '../../domain/enums/notification-status.enum';
import { NotificationType } from '../../domain/enums/notification-type.enum';

export interface CreateNotificationInput {
  type: NotificationType;
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface NotificationFilters {
  status?: NotificationStatus;
  type?: NotificationType;
}

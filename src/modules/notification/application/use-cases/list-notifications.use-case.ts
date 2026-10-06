import { Notification } from '../../domain/entities/notification.entity';
import { NotificationFilters } from '../contracts/notification.input';
import { NotificationRepositoryPort } from '../ports/notification-repository.port';

export class ListNotificationsUseCase {
  constructor(private readonly notifications: NotificationRepositoryPort) {}

  execute(filters: NotificationFilters = {}): Promise<Notification[]> {
    return this.notifications.findAll(filters);
  }
}

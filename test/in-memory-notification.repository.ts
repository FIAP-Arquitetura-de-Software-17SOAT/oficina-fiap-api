import { Notification } from '../src/modules/notification/entities/notification.entity';
import { NotificationFilters } from '../src/modules/notification/repositories/notification.repository';

export class InMemoryNotificationRepository {
  private readonly notifications = new Map<string, Notification>();

  async create(notification: Notification): Promise<Notification> {
    const persisted = this.clone(notification);
    this.notifications.set(persisted.getId(), persisted);
    return this.clone(persisted);
  }

  async findById(id: string): Promise<Notification | null> {
    const notification = this.notifications.get(id);
    return notification ? this.clone(notification) : null;
  }

  async findAll(filters: NotificationFilters = {}): Promise<Notification[]> {
    return Array.from(this.notifications.values())
      .filter((notification) => !filters.status || notification.getStatus() === filters.status)
      .filter((notification) => !filters.type || notification.getType() === filters.type)
      .sort((left, right) => right.getCreatedAt().getTime() - left.getCreatedAt().getTime())
      .map((notification) => this.clone(notification));
  }

  async update(notification: Notification, expectedUpdatedAt: Date): Promise<Notification | null> {
    const stored = this.notifications.get(notification.getId());
    if (!stored || stored.getUpdatedAt().getTime() !== expectedUpdatedAt.getTime()) return null;
    const persisted = this.clone(notification);
    this.notifications.set(persisted.getId(), persisted);
    return this.clone(persisted);
  }

  private clone(notification: Notification): Notification {
    return Notification.restore(notification.getId(), {
      type: notification.getType(), to: notification.getTo(), subject: notification.getSubject(),
      text: notification.getText(), html: notification.getHtml(), status: notification.getStatus(),
      attempts: notification.getAttempts(), lastError: notification.getLastError(),
      sentAt: notification.getSentAt() ? new Date(notification.getSentAt()!) : null,
      createdAt: new Date(notification.getCreatedAt()), updatedAt: new Date(notification.getUpdatedAt()),
    });
  }
}

import { Notification } from '../src/modules/notification/domain/entities/notification.entity';
import { NotificationFilters } from '../src/modules/notification/application/contracts/notification.input';
import { NotificationRepositoryPort } from '../src/modules/notification/application/ports/notification-repository.port';

export class InMemoryNotificationRepository implements NotificationRepositoryPort {
  private readonly notifications = new Map<string, Notification>();

  create(notification: Notification): Promise<Notification> {
    const persisted = this.clone(notification);
    this.notifications.set(persisted.getId(), persisted);
    return Promise.resolve(this.clone(persisted));
  }

  findById(id: string): Promise<Notification | null> {
    const notification = this.notifications.get(id);
    return Promise.resolve(notification ? this.clone(notification) : null);
  }

  findAll(filters: NotificationFilters = {}): Promise<Notification[]> {
    return Promise.resolve(
      Array.from(this.notifications.values())
        .filter(
          (notification) =>
            !filters.status || notification.getStatus() === filters.status,
        )
        .filter(
          (notification) =>
            !filters.type || notification.getType() === filters.type,
        )
        .sort(
          (left, right) =>
            right.getCreatedAt().getTime() - left.getCreatedAt().getTime(),
        )
        .map((notification) => this.clone(notification)),
    );
  }

  update(
    notification: Notification,
    expectedUpdatedAt: Date,
  ): Promise<Notification | null> {
    const stored = this.notifications.get(notification.getId());

    if (
      !stored ||
      stored.getUpdatedAt().getTime() !== expectedUpdatedAt.getTime()
    ) {
      return Promise.resolve(null);
    }

    const persisted = this.clone(notification);
    this.notifications.set(persisted.getId(), persisted);
    return Promise.resolve(this.clone(persisted));
  }

  private clone(notification: Notification): Notification {
    return Notification.restore(notification.getId(), {
      type: notification.getType(),
      to: notification.getTo(),
      subject: notification.getSubject(),
      text: notification.getText(),
      html: notification.getHtml(),
      status: notification.getStatus(),
      attempts: notification.getAttempts(),
      lastError: notification.getLastError(),
      sentAt: notification.getSentAt()
        ? new Date(notification.getSentAt()!)
        : null,
      createdAt: new Date(notification.getCreatedAt()),
      updatedAt: new Date(notification.getUpdatedAt()),
    });
  }
}

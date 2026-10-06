import { Notification } from '../../domain/entities/notification.entity';
import { NotificationFilters } from '../contracts/notification.input';

export abstract class NotificationRepositoryPort {
  abstract create(notification: Notification): Promise<Notification>;
  abstract findById(id: string): Promise<Notification | null>;
  abstract findAll(filters?: NotificationFilters): Promise<Notification[]>;
  /**
   * Compare-and-set: só grava se `updatedAt` no banco ainda for
   * `expectedUpdatedAt`. Devolve `null` quando outro envio chegou antes.
   */
  abstract update(
    notification: Notification,
    expectedUpdatedAt: Date,
  ): Promise<Notification | null>;
}

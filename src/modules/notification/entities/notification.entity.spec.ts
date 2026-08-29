import { NotificationStatus } from '../enums/notification-status.enum';
import { NotificationType } from '../enums/notification-type.enum';
import { Notification } from './notification.entity';

const message = {
  type: NotificationType.BUDGET_READY,
  to: 'customer@example.com',
  subject: 'Your budget is ready',
  text: 'Your budget is ready for review.',
  html: '<p>Your budget is ready for review.</p>',
};

describe('Notification', () => {
  it('records a failed attempt and permits retry', () => {
    const notification = Notification.create(message);

    notification.markFailed(new Error('  SMTP unavailable  '));

    expect(notification.getStatus()).toBe(NotificationStatus.FAILED);
    expect(notification.getAttempts()).toBe(1);
    expect(notification.getLastError()).toBe('SMTP unavailable');

    notification.prepareRetry();

    expect(notification.getStatus()).toBe(NotificationStatus.PENDING);
  });

  it('rejects retrying a sent notification', () => {
    const notification = Notification.create(message);
    notification.markSent();

    expect(() => notification.prepareRetry()).toThrow(
      'Somente notificação que falhou pode ser reenviada',
    );
  });

  it('marks a notification as sent with a monotonic timestamp', () => {
    const originalUpdatedAt = new Date('2099-01-01T00:00:00.000Z');
    const sentAt = new Date('2026-08-23T10:00:00.000Z');
    const notification = Notification.restore('notification-123', {
      ...message,
      status: NotificationStatus.FAILED,
      attempts: 1,
      lastError: 'SMTP unavailable',
      updatedAt: originalUpdatedAt,
    });

    notification.markSent(sentAt);

    expect(notification.getStatus()).toBe(NotificationStatus.SENT);
    expect(notification.getAttempts()).toBe(2);
    expect(notification.getLastError()).toBeNull();
    expect(notification.getSentAt()).toBe(sentAt);
    expect(notification.getUpdatedAt().getTime()).toBeGreaterThan(
      originalUpdatedAt.getTime(),
    );
  });
});

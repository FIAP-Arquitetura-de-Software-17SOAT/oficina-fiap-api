import { Notification } from '../../../domain/entities/notification.entity';
import { NotificationStatus } from '../../../domain/enums/notification-status.enum';
import { NotificationType } from '../../../domain/enums/notification-type.enum';
import { NotificationResponseMapper } from './notification-response.mapper';

const makeNotification = (subject = 'Budget ready') =>
  Notification.create({
    type: NotificationType.BUDGET_READY,
    to: 'customer@example.com',
    subject,
    text: 'Ready',
    html: '<p>Ready</p>',
  });

describe('NotificationResponseMapper', () => {
  it('flattens the entity into the response contract', () => {
    const notification = makeNotification();

    expect(NotificationResponseMapper.toResponse(notification)).toEqual({
      id: notification.getId(),
      type: NotificationType.BUDGET_READY,
      status: NotificationStatus.PENDING,
      to: 'customer@example.com',
      subject: 'Budget ready',
      text: 'Ready',
      html: '<p>Ready</p>',
      attempts: 0,
      lastError: null,
      sentAt: null,
      createdAt: notification.getCreatedAt(),
      updatedAt: notification.getUpdatedAt(),
    });
  });

  it('maps lists preserving order', () => {
    const responses = NotificationResponseMapper.toResponseList([
      makeNotification('A'),
      makeNotification('B'),
    ]);

    expect(responses.map((r) => r.subject)).toEqual(['A', 'B']);
  });
});

import { Notification } from '../entities/notification.entity';
import { NotificationStatus } from '../enums/notification-status.enum';
import { NotificationType } from '../enums/notification-type.enum';
import { NotificationService } from '../services/notification.service';
import { NotificationController } from './notification.controller';

describe('NotificationController', () => {
  let service: jest.Mocked<NotificationService>;
  let controller: NotificationController;

  beforeEach(() => {
    service = { findAll: jest.fn(), retry: jest.fn() } as unknown as jest.Mocked<NotificationService>;
    controller = new NotificationController(service);
  });

  it('retries a failed notification', async () => {
    const failedThenSent = Notification.create({
      type: NotificationType.BUDGET_READY,
      to: 'customer@example.com', subject: 'Budget ready', text: 'Ready', html: '<p>Ready</p>',
    });
    failedThenSent.markFailed(new Error('SMTP unavailable'));
    failedThenSent.prepareRetry();
    failedThenSent.markSent();
    service.retry.mockResolvedValue(failedThenSent);

    await expect(controller.retry('a1b2c3d4-1c2e-4f5a-8b9c-0d1e2f3a4b5c'))
      .resolves.toMatchObject({ status: NotificationStatus.SENT });
  });

  it('passes query filters when listing notifications', async () => {
    service.findAll.mockResolvedValue([]);
    await controller.findAll({ status: NotificationStatus.FAILED });
    expect(service.findAll).toHaveBeenCalledWith({ status: NotificationStatus.FAILED });
  });
});

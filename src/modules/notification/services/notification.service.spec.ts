import { Notification } from '../entities/notification.entity';
import { NotificationStatus } from '../enums/notification-status.enum';
import { NotificationType } from '../enums/notification-type.enum';
import { NotificationRepository } from '../repositories/notification.repository';
import { EmailSender } from '../../../shared/notifications/email/email-sender';
import { NotificationService } from './notification.service';
import { ConflictException } from '@nestjs/common';

describe('NotificationService', () => {
  let repository: jest.Mocked<NotificationRepository>;
  let emailSender: jest.Mocked<EmailSender>;
  let service: NotificationService;

  const message = {
    type: NotificationType.BUDGET_READY,
    to: 'customer@example.com',
    subject: 'Budget ready',
    text: 'Your budget is ready.',
    html: '<p>Your budget is ready.</p>',
  };

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<NotificationRepository>;
    emailSender = { send: jest.fn() };
    service = new NotificationService(repository, emailSender);
  });

  it('persists a failed delivery without rejecting its business caller', async () => {
    const created = Notification.create(message);
    repository.create.mockResolvedValue(created);
    repository.update.mockImplementation((notification) =>
      Promise.resolve(notification),
    );
    emailSender.send.mockRejectedValue(new Error('SMTP unavailable'));

    await expect(service.enqueue(message)).resolves.toBeUndefined();

    expect(created.getStatus()).toBe(NotificationStatus.FAILED);
    expect(created.getLastError()).toBe('SMTP unavailable');
    expect(repository.create).toHaveBeenCalledWith(expect.any(Notification));
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ getStatus: expect.any(Function) }),
      expect.any(Date),
    );
  });

  it('rejects retry for a notification that did not fail', async () => {
    const notification = Notification.create(message);
    repository.findById.mockResolvedValue(notification);

    await expect(service.retry(notification.getId())).rejects.toThrow(
      ConflictException,
    );
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it('retries a failed notification and returns its sent state', async () => {
    const notification = Notification.create(message);
    notification.markFailed(new Error('SMTP unavailable'));
    repository.findById.mockResolvedValue(notification);
    repository.update.mockImplementation((updated) => Promise.resolve(updated));

    const retried = await service.retry(notification.getId());

    expect(retried.getStatus()).toBe(NotificationStatus.SENT);
    expect(retried.getAttempts()).toBe(2);
    expect(emailSender.send).toHaveBeenCalledWith({
      to: message.to, subject: message.subject, text: message.text, html: message.html,
    });
  });
});

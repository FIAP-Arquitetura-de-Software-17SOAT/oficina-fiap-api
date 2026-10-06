import { LoggerPort } from '../../../../shared/application/logger.port';
import { Notification } from '../../domain/entities/notification.entity';
import { NotificationStatus } from '../../domain/enums/notification-status.enum';
import { NotificationType } from '../../domain/enums/notification-type.enum';
import { NotificationApplicationError } from '../errors/notification-application.error';
import { EmailSenderPort } from '../ports/email-sender.port';
import { NotificationRepositoryPort } from '../ports/notification-repository.port';
import { EnqueueNotificationUseCase } from './enqueue-notification.use-case';
import { ListNotificationsUseCase } from './list-notifications.use-case';
import { RetryNotificationUseCase } from './retry-notification.use-case';

type MockedRepository = { [K in keyof NotificationRepositoryPort]: jest.Mock };

describe('Notification use cases without Nest', () => {
  let repository: MockedRepository;
  let email: { send: jest.Mock };
  let logger: { error: jest.Mock };
  let enqueue: EnqueueNotificationUseCase;
  let retry: RetryNotificationUseCase;

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
    };
    email = { send: jest.fn() };
    logger = { error: jest.fn() };
    enqueue = new EnqueueNotificationUseCase(
      repository,
      email as EmailSenderPort,
      logger as LoggerPort,
    );
    retry = new RetryNotificationUseCase(
      repository,
      email as EmailSenderPort,
      logger as LoggerPort,
    );
  });

  describe('enqueue', () => {
    it('persists a failed delivery without rejecting its business caller', async () => {
      const created = Notification.create(message);
      repository.create.mockResolvedValue(created);
      repository.update.mockImplementation((notification: Notification) =>
        Promise.resolve(notification),
      );
      email.send.mockRejectedValue(new Error('SMTP unavailable'));

      await expect(enqueue.execute(message)).resolves.toBeUndefined();

      expect(created.getStatus()).toBe(NotificationStatus.FAILED);
      expect(created.getLastError()).toBe('SMTP unavailable');
      expect(repository.create).toHaveBeenCalledWith(expect.any(Notification));
      expect(repository.update).toHaveBeenCalledWith(
        expect.objectContaining({ getStatus: expect.any(Function) }),
        expect.any(Date),
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ notificationId: created.getId() }),
        'Notification delivery failed',
      );
    });

    it('marks the notification as sent when the e-mail goes out', async () => {
      const created = Notification.create(message);
      repository.create.mockResolvedValue(created);
      repository.update.mockImplementation((notification: Notification) =>
        Promise.resolve(notification),
      );
      email.send.mockResolvedValue(undefined);

      await enqueue.execute(message);

      expect(created.getStatus()).toBe(NotificationStatus.SENT);
      expect(created.getAttempts()).toBe(1);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('logs instead of throwing when the notification cannot even be created', async () => {
      repository.create.mockRejectedValue(new Error('database down'));

      await expect(enqueue.execute(message)).resolves.toBeUndefined();

      expect(email.send).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ type: message.type }),
        'Notification enqueue failed',
      );
    });

    it('logs when the sent state loses the compare-and-set and keeps going', async () => {
      const created = Notification.create(message);
      repository.create.mockResolvedValue(created);
      repository.update.mockResolvedValue(null);
      email.send.mockResolvedValue(undefined);

      await expect(enqueue.execute(message)).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.any(NotificationApplicationError) as unknown,
        }),
        'Notification sent state could not be persisted',
      );
    });

    it('logs when the failed state cannot be persisted either', async () => {
      const created = Notification.create(message);
      repository.create.mockResolvedValue(created);
      repository.update.mockResolvedValue(null);
      email.send.mockRejectedValue(new Error('SMTP unavailable'));

      await expect(enqueue.execute(message)).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ notificationId: created.getId() }),
        'Notification failure state could not be persisted',
      );
    });
  });

  describe('retry', () => {
    it('rejects retry for a notification that did not fail', async () => {
      const notification = Notification.create(message);
      repository.findById.mockResolvedValue(notification);

      await expect(retry.execute(notification.getId())).rejects.toMatchObject({
        code: 'NOTIFICATION_NOT_FAILED',
        kind: 'CONFLICT',
      });
      expect(email.send).not.toHaveBeenCalled();
    });

    it('NOTIFICATION_NOT_FOUND when the id is unknown', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(retry.execute('missing')).rejects.toMatchObject({
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'Notificação não encontrada',
      });
    });

    it('retries a failed notification and returns its sent state', async () => {
      const notification = Notification.create(message);
      notification.markFailed(new Error('SMTP unavailable'));
      repository.findById.mockResolvedValue(notification);
      repository.update.mockImplementation((updated: Notification) =>
        Promise.resolve(updated),
      );

      const retried = await retry.execute(notification.getId());

      expect(retried.getStatus()).toBe(NotificationStatus.SENT);
      expect(retried.getAttempts()).toBe(2);
      expect(email.send).toHaveBeenCalledWith({
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    });

    it('surfaces a persistence failure to the operator on retry', async () => {
      const notification = Notification.create(message);
      notification.markFailed(new Error('SMTP unavailable'));
      repository.findById.mockResolvedValue(notification);
      repository.update.mockRejectedValue(new Error('database down'));

      await expect(retry.execute(notification.getId())).rejects.toThrow(
        'database down',
      );
    });

    it('accepts losing the compare-and-set to a delivery that already succeeded', async () => {
      const notification = Notification.create(message);
      notification.markFailed(new Error('SMTP unavailable'));
      const sentElsewhere = Notification.restore(notification.getId(), {
        ...message,
        status: NotificationStatus.SENT,
      });
      repository.findById
        .mockResolvedValueOnce(notification)
        .mockResolvedValue(sentElsewhere);
      repository.update.mockResolvedValue(null);
      email.send.mockResolvedValue(undefined);

      // Comportamento herdado: perder a corrida para um envio bem-sucedido não
      // é erro para o operador; o estado atual (SENT) é devolvido.
      await expect(retry.execute(notification.getId())).resolves.toBe(
        sentElsewhere,
      );
    });

    it('NOTIFICATION_CONCURRENT_UPDATE when the race was lost to another retry', async () => {
      const notification = Notification.create(message);
      notification.markFailed(new Error('SMTP unavailable'));
      repository.findById.mockResolvedValue(notification);
      repository.update.mockResolvedValue(null);

      await expect(retry.execute(notification.getId())).rejects.toMatchObject({
        code: 'NOTIFICATION_CONCURRENT_UPDATE',
      });
    });
  });

  it('list delegates the filters to the repository', async () => {
    repository.findAll.mockResolvedValue([]);

    await new ListNotificationsUseCase(repository).execute({
      status: NotificationStatus.FAILED,
    });

    expect(repository.findAll).toHaveBeenCalledWith({
      status: NotificationStatus.FAILED,
    });
  });
});

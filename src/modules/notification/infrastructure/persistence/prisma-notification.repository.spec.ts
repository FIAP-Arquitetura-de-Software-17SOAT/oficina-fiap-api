import { PrismaService } from '../../../../shared/database/prisma.service';
import { Notification } from '../../domain/entities/notification.entity';
import { NotificationStatus } from '../../domain/enums/notification-status.enum';
import { NotificationType } from '../../domain/enums/notification-type.enum';
import { PrismaNotificationRepository } from './prisma-notification.repository';

const updatedAt = new Date('2026-08-23T10:00:00.000Z');
const row = {
  id: 'a1b2c3d4-1c2e-4f5a-8b9c-0d1e2f3a4b5c',
  type: NotificationType.BUDGET_READY,
  status: NotificationStatus.FAILED,
  to: 'customer@example.com',
  subject: 'Budget ready',
  text: 'Your budget is ready.',
  html: '<p>Your budget is ready.</p>',
  attempts: 1,
  lastError: 'SMTP unavailable',
  sentAt: null,
  createdAt: updatedAt,
  updatedAt,
};

describe('PrismaNotificationRepository', () => {
  let prisma: {
    notification: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let repository: PrismaNotificationRepository;

  beforeEach(() => {
    prisma = {
      notification: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    repository = new PrismaNotificationRepository(
      prisma as unknown as PrismaService,
    );
  });

  it('persists an outgoing notification', async () => {
    prisma.notification.create.mockResolvedValue(row);
    await repository.create(Notification.restore(row.id, row));
    expect(prisma.notification.create).toHaveBeenCalledWith({ data: row });
  });

  it('updates delivery state only when its timestamp is current', async () => {
    const notification = Notification.restore(row.id, row);
    notification.prepareRetry();
    const transaction = {
      notification: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          ...row,
          status: NotificationStatus.PENDING,
          updatedAt: notification.getUpdatedAt(),
        }),
      },
    };
    prisma.$transaction.mockImplementation((callback) =>
      Promise.resolve(callback(transaction) as Promise<unknown>),
    );

    const result = await repository.update(notification, updatedAt);

    expect(transaction.notification.updateMany).toHaveBeenCalledWith({
      where: { id: row.id, updatedAt },
      data: expect.objectContaining({
        status: NotificationStatus.PENDING,
        updatedAt: notification.getUpdatedAt(),
      }),
    });
    expect(result?.getStatus()).toBe(NotificationStatus.PENDING);
  });

  it('finds a notification by id and returns null when missing', async () => {
    prisma.notification.findUnique.mockResolvedValueOnce(row);
    const found = await repository.findById(row.id);
    expect(prisma.notification.findUnique).toHaveBeenCalledWith({
      where: { id: row.id },
    });
    expect(found?.getStatus()).toBe(NotificationStatus.FAILED);

    prisma.notification.findUnique.mockResolvedValueOnce(null);
    await expect(repository.findById('missing')).resolves.toBeNull();
  });

  it('lists notifications newest first, applying the filters as-is', async () => {
    prisma.notification.findMany.mockResolvedValue([row]);
    const found = await repository.findAll({
      status: NotificationStatus.FAILED,
    });
    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { status: NotificationStatus.FAILED },
      orderBy: { createdAt: 'desc' },
    });
    expect(found).toHaveLength(1);
    expect(found[0].getId()).toBe(row.id);
  });

  it('returns null when the compare-and-set finds a newer version', async () => {
    const transaction = {
      notification: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation((callback) =>
      Promise.resolve(callback(transaction) as Promise<unknown>),
    );

    await expect(
      repository.update(Notification.restore(row.id, row), updatedAt),
    ).resolves.toBeNull();
    expect(transaction.notification.findUnique).not.toHaveBeenCalled();
  });
});

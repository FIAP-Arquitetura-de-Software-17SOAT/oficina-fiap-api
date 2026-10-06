import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { Notification } from '../../domain/entities/notification.entity';
import { NotificationFilters } from '../../application/contracts/notification.input';
import { NotificationRepositoryPort } from '../../application/ports/notification-repository.port';
import { NotificationPersistenceMapper } from './notification-persistence.mapper';

@Injectable()
export class PrismaNotificationRepository implements NotificationRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(notification: Notification): Promise<Notification> {
    const created = await this.prisma.notification.create({
      data: NotificationPersistenceMapper.toPersistence(notification),
    });
    return NotificationPersistenceMapper.toDomain(created);
  }

  async findById(id: string): Promise<Notification | null> {
    const record = await this.prisma.notification.findUnique({ where: { id } });
    return record ? NotificationPersistenceMapper.toDomain(record) : null;
  }

  async findAll(filters: NotificationFilters = {}): Promise<Notification[]> {
    const records = await this.prisma.notification.findMany({
      where: filters,
      orderBy: { createdAt: 'desc' },
    });
    return records.map((record) =>
      NotificationPersistenceMapper.toDomain(record),
    );
  }

  async update(
    notification: Notification,
    expectedUpdatedAt: Date,
  ): Promise<Notification | null> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.notification.updateMany({
        where: { id: notification.getId(), updatedAt: expectedUpdatedAt },
        data: {
          status: notification.getStatus(),
          attempts: notification.getAttempts(),
          lastError: notification.getLastError(),
          sentAt: notification.getSentAt(),
          updatedAt: notification.getUpdatedAt(),
        },
      });
      if (result.count === 0) return null;
      return tx.notification.findUnique({
        where: { id: notification.getId() },
      });
    });
    return updated ? NotificationPersistenceMapper.toDomain(updated) : null;
  }
}

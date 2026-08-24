import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { Notification } from '../entities/notification.entity';
import { NotificationStatus } from '../enums/notification-status.enum';
import { NotificationType } from '../enums/notification-type.enum';
import { NotificationMapper } from '../mappers/notification.mapper';

export interface NotificationFilters {
  status?: NotificationStatus;
  type?: NotificationType;
}

@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(notification: Notification): Promise<Notification> {
    const created = await this.prisma.notification.create({
      data: NotificationMapper.toPersistence(notification),
    });
    return NotificationMapper.toDomain(created);
  }

  async findById(id: string): Promise<Notification | null> {
    const record = await this.prisma.notification.findUnique({ where: { id } });
    return record ? NotificationMapper.toDomain(record) : null;
  }

  async findAll(filters: NotificationFilters = {}): Promise<Notification[]> {
    const records = await this.prisma.notification.findMany({
      where: filters,
      orderBy: { createdAt: 'desc' },
    });
    return records.map((record) => NotificationMapper.toDomain(record));
  }

  async update(notification: Notification, expectedUpdatedAt: Date): Promise<Notification | null> {
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
      return tx.notification.findUnique({ where: { id: notification.getId() });
    });
    return updated ? NotificationMapper.toDomain(updated) : null;
  }
}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { EmailModule } from '../../shared/notifications/email/email.module';
import { NotificationController } from './controllers/notification.controller';
import { NotificationRepository } from './repositories/notification.repository';
import { NotificationService } from './services/notification.service';

@Module({
  imports: [PrismaModule, EmailModule],
  controllers: [NotificationController],
  providers: [NotificationRepository, NotificationService],
  exports: [NotificationService, NotificationRepository],
})
export class NotificationModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerPort } from '../../shared/application/logger.port';
import { NestLoggerAdapter } from '../../shared/infrastructure/logging/nest-logger.adapter';
import { NotificationController } from './presentation/http/notification.controller';
import { EmailSenderPort } from './application/ports/email-sender.port';
import { NotificationRepositoryPort } from './application/ports/notification-repository.port';
import { EnqueueNotificationUseCase } from './application/use-cases/enqueue-notification.use-case';
import { ListNotificationsUseCase } from './application/use-cases/list-notifications.use-case';
import { RetryNotificationUseCase } from './application/use-cases/retry-notification.use-case';
import { NodemailerEmailSender } from './infrastructure/email/nodemailer-email-sender';
import { PrismaNotificationRepository } from './infrastructure/persistence/prisma-notification.repository';

@Module({
  imports: [ConfigModule],
  controllers: [NotificationController],
  providers: [
    {
      provide: NotificationRepositoryPort,
      useClass: PrismaNotificationRepository,
    },
    { provide: EmailSenderPort, useClass: NodemailerEmailSender },
    {
      provide: LoggerPort,
      useValue: new NestLoggerAdapter('NotificationService'),
    },
    ...[EnqueueNotificationUseCase, RetryNotificationUseCase].map(
      (useCase) => ({
        provide: useCase,
        useFactory: (
          notifications: NotificationRepositoryPort,
          email: EmailSenderPort,
          logger: LoggerPort,
        ) => new useCase(notifications, email, logger),
        inject: [NotificationRepositoryPort, EmailSenderPort, LoggerPort],
      }),
    ),
    {
      provide: ListNotificationsUseCase,
      useFactory: (notifications: NotificationRepositoryPort) =>
        new ListNotificationsUseCase(notifications),
      inject: [NotificationRepositoryPort],
    },
  ],
  // O que os outros módulos precisam: disparar uma notificação. Listagem e
  // reenvio são operação do administrador, só pelo HTTP deste módulo.
  exports: [EnqueueNotificationUseCase],
})
export class NotificationModule {}

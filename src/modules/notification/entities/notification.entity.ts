import { randomUUID } from 'crypto';
import { DomainException } from '../../../shared/domain/domain.exception';
import { NotificationStatus } from '../enums/notification-status.enum';
import { NotificationType } from '../enums/notification-type.enum';

export interface NotificationProps {
  type: NotificationType;
  to: string;
  subject: string;
  text: string;
  html: string;
  status?: NotificationStatus;
  attempts?: number;
  lastError?: string | null;
  sentAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Notification {
  private readonly id: string;
  private readonly type: NotificationType;
  private readonly to: string;
  private readonly subject: string;
  private readonly text: string;
  private readonly html: string;
  private status: NotificationStatus;
  private attempts: number;
  private lastError: string | null;
  private sentAt: Date | null;
  private readonly createdAt: Date;
  private updatedAt: Date;

  private constructor(id: string, props: NotificationProps) {
    this.id = id;
    this.type = props.type;
    this.to = props.to;
    this.subject = props.subject;
    this.text = props.text;
    this.html = props.html;
    this.status = props.status ?? NotificationStatus.PENDING;
    this.attempts = props.attempts ?? 0;
    this.lastError = props.lastError ?? null;
    this.sentAt = props.sentAt ?? null;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
  }

  static create(props: NotificationProps): Notification {
    return new Notification(randomUUID(), props);
  }

  static restore(id: string, props: NotificationProps): Notification {
    return new Notification(id, props);
  }

  markSent(sentAt = new Date()): void {
    this.attempts += 1;
    this.status = NotificationStatus.SENT;
    this.lastError = null;
    this.sentAt = sentAt;
    this.touch();
  }

  markFailed(error: Error): void {
    this.attempts += 1;
    this.status = NotificationStatus.FAILED;
    this.lastError = error.message.trim();
    this.touch();
  }

  prepareRetry(): void {
    if (this.status !== NotificationStatus.FAILED) {
      throw new DomainException(
        'Somente notificação que falhou pode ser reenviada',
      );
    }

    this.status = NotificationStatus.PENDING;
    this.touch();
  }

  getId(): string {
    return this.id;
  }

  getType(): NotificationType {
    return this.type;
  }

  getTo(): string {
    return this.to;
  }

  getSubject(): string {
    return this.subject;
  }

  getText(): string {
    return this.text;
  }

  getHtml(): string {
    return this.html;
  }

  getStatus(): NotificationStatus {
    return this.status;
  }

  getAttempts(): number {
    return this.attempts;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  getSentAt(): Date | null {
    return this.sentAt;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  private touch(): void {
    const now = new Date();
    this.updatedAt =
      now.getTime() > this.updatedAt.getTime()
        ? now
        : new Date(this.updatedAt.getTime() + 1);
  }
}

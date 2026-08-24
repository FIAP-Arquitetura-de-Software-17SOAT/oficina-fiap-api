import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { NotificationStatus } from '../enums/notification-status.enum';
import { NotificationType } from '../enums/notification-type.enum';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class FindNotificationsQueryDto {
  @ApiPropertyOptional({ enum: NotificationStatus })
  @Transform(trim)
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @ApiPropertyOptional({ enum: NotificationType })
  @Transform(trim)
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;
}

export class NotificationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: NotificationType })
  type: NotificationType;

  @ApiProperty({ enum: NotificationStatus })
  status: NotificationStatus;

  @ApiProperty({ format: 'email' })
  to: string;

  @ApiProperty()
  subject: string;

  @ApiProperty()
  text: string;

  @ApiProperty()
  html: string;

  @ApiProperty({ example: 1 })
  attempts: number;

  @ApiPropertyOptional()
  lastError: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  sentAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

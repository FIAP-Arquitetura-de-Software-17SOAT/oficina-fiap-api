import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '../../../../../generated/prisma/enums';
import { Roles } from '../../../../shared/http/auth/roles.decorator';
import {
  FindNotificationsQueryDto,
  NotificationResponseDto,
} from './dto/notification.dto';
import { NotificationResponseMapper } from './mappers/notification-response.mapper';
import { ListNotificationsUseCase } from '../../application/use-cases/list-notifications.use-case';
import { RetryNotificationUseCase } from '../../application/use-cases/retry-notification.use-case';

@ApiTags('notifications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token de acesso ausente ou inválido' })
@Roles(Role.ADMIN)
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly listNotifications: ListNotificationsUseCase,
    private readonly retryNotification: RetryNotificationUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista as notificações de envio' })
  @ApiOkResponse({ type: NotificationResponseDto, isArray: true })
  async findAll(
    @Query() query: FindNotificationsQueryDto,
  ): Promise<NotificationResponseDto[]> {
    return NotificationResponseMapper.toResponseList(
      await this.listNotifications.execute(query),
    );
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reenvia uma notificação que falhou' })
  @ApiOkResponse({ type: NotificationResponseDto })
  @ApiNotFoundResponse({ description: 'Notificação não encontrada' })
  @ApiConflictResponse({
    description: 'Somente notificação que falhou pode ser reenviada',
  })
  async retry(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NotificationResponseDto> {
    return NotificationResponseMapper.toResponse(
      await this.retryNotification.execute(id),
    );
  }
}

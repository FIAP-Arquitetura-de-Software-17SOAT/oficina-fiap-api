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
import { Role } from '../../../../generated/prisma/enums';
import { Roles } from '../../../shared/http/auth/roles.decorator';
import {
  FindNotificationsQueryDto,
  NotificationResponseDto,
} from '../dto/notification.dto';
import { NotificationMapper } from '../mappers/notification.mapper';
import { NotificationService } from '../services/notification.service';

@ApiTags('notifications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Roles(Role.ADMIN)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Lists delivery notifications' })
  @ApiOkResponse({ type: NotificationResponseDto, isArray: true })
  async findAll(
    @Query() query: FindNotificationsQueryDto,
  ): Promise<NotificationResponseDto[]> {
    return NotificationMapper.toResponseList(
      await this.notificationService.findAll(query),
    );
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retries a failed notification' })
  @ApiOkResponse({ type: NotificationResponseDto })
  @ApiNotFoundResponse({ description: 'Notificação não encontrada' })
  @ApiConflictResponse({
    description: 'Somente notificação que falhou pode ser reenviada',
  })
  async retry(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NotificationResponseDto> {
    return NotificationMapper.toResponse(
      await this.notificationService.retry(id),
    );
  }
}

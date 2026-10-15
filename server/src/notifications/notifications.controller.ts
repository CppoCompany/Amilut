import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { MarkAllReadDto } from './dto/mark-all-read.dto';
import { NotificationDto } from './dto/notification.dto';
import { UnreadCountDto } from './dto/unread-count.dto';
import { NotificationsService } from './notifications.service';

/** Authentication is enforced by the global JwtAuthGuard (APP_GUARD). Every
 *  route is scoped to the signed-in user — there is no cross-user listing. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOkResponse({ type: NotificationDto, isArray: true })
  list(@CurrentUser() user: JwtPayload): Promise<NotificationDto[]> {
    return this.notifications.listForUser(user.sub);
  }

  @Get('unread-count')
  @ApiOkResponse({ type: UnreadCountDto })
  async unreadCount(@CurrentUser() user: JwtPayload): Promise<UnreadCountDto> {
    return { count: await this.notifications.unreadCount(user.sub) };
  }

  /** Declared before `:id/read`; the dashboard calls this once its
   *  "הודעות" widget has shown the list. Returns what is still unread. */
  @Patch('read-all')
  @ApiOkResponse({ type: UnreadCountDto })
  async markAllRead(
    @Body() dto: MarkAllReadDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<UnreadCountDto> {
    return {
      count: await this.notifications.markAllRead(user.sub, dto.upToId),
    };
  }

  @Patch(':id/read')
  @HttpCode(204)
  @ApiNoContentResponse()
  markRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.notifications.markRead(id, user.sub);
  }
}

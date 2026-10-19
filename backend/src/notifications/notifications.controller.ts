import { Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { NotificationsService } from './notifications.service'

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.notifications.list(req.user.id)
  }

  @Get('unread-count')
  unreadCount(@Req() req: AuthenticatedRequest) {
    return this.notifications.unreadCount(req.user.id)
  }

  @Patch(':id/read')
  markRead(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.notifications.markRead(req.user.id, id)
  }

  @Patch('read-all')
  markAllRead(@Req() req: AuthenticatedRequest) {
    return this.notifications.markAllRead(req.user.id)
  }
}

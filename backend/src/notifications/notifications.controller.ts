import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { NotificationsService, PreferenceUpdate } from './notifications.service'

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    return this.notifications.list(req.user.id, {
      unreadOnly: unreadOnly === 'true',
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined
    })
  }

  @Get('unread-count')
  unreadCount(@Req() req: AuthenticatedRequest) {
    return this.notifications.unreadCount(req.user.id)
  }

  @Patch(':id/read')
  @HttpCode(200)
  markRead(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(req.user.id, id)
  }

  @Patch('read-all')
  @HttpCode(200)
  markAllRead(@Req() req: AuthenticatedRequest) {
    return this.notifications.markAllRead(req.user.id)
  }

  @Get('preferences')
  preferences(@Req() req: AuthenticatedRequest) {
    return this.notifications.preferences(req.user.id)
  }

  @Patch('preferences')
  updatePreferences(@Req() req: AuthenticatedRequest, @Body() input: PreferenceUpdate) {
    return this.notifications.updatePreferences(req.user.id, input)
  }

  @Get('saved-search-alerts')
  savedSearchAlerts(@Req() req: AuthenticatedRequest, @Query('limit') limit?: string) {
    return this.notifications.listSavedSearchAlerts(req.user.id, limit ? Number(limit) : undefined)
  }

  @Patch('saved-search-alerts/:id/read')
  @HttpCode(200)
  markSavedSearchAlertRead(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markSavedSearchAlertRead(req.user.id, id)
  }
}

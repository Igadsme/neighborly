import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { ListModerationQuery, ModerationActionDto } from './dto'
import { SafetyService } from './safety.service'

@ApiTags('moderation')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('moderation')
export class ModerationController {
  constructor(private readonly safety: SafetyService) {}

  @Get('reports')
  list(@Req() request: AuthenticatedRequest, @Query() query: ListModerationQuery) {
    return this.safety.listQueue(request.user.id, query.status ?? 'OPEN')
  }

  @Get('reports/:id')
  get(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.safety.getReport(request.user.id, id)
  }

  @Post('reports/:id/actions')
  act(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ModerationActionDto
  ) {
    return this.safety.act(request.user.id, id, input)
  }
}

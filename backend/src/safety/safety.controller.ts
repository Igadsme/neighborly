import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { enforceRateLimit } from '../common/rate-limit'
import { BlockUserDto, CreateReportDto } from './dto'
import { SafetyService } from './safety.service'

@ApiTags('safety')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('safety')
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Post('reports')
  async createReport(@Req() request: AuthenticatedRequest, @Body() input: CreateReportDto) {
    await enforceRateLimit('reports', request.user.id)
    return this.safety.createReport(request.user.id, input)
  }

  @Get('reports')
  listReports(@Req() request: AuthenticatedRequest) {
    return this.safety.listMine(request.user.id)
  }

  @Get('blocks')
  listBlocks(@Req() request: AuthenticatedRequest) {
    return this.safety.listBlocks(request.user.id)
  }

  @Post('blocks')
  block(@Req() request: AuthenticatedRequest, @Body() input: BlockUserDto) {
    return this.safety.block(request.user.id, input.userId)
  }

  @Delete('blocks/:userId')
  unblock(@Req() request: AuthenticatedRequest, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.safety.unblock(request.user.id, userId)
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { CreateReportDto, ReportQueryDto, ResolveReportDto } from './dto'
import { ModeratorGuard } from './moderator.guard'
import { SafetyService } from './safety.service'

@ApiTags('safety')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('safety')
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Get('blocks')
  blocks(@Req() request: AuthenticatedRequest) {
    return this.safety.listBlocks(request.user.id)
  }

  @Post('blocks/:userId')
  block(@Req() request: AuthenticatedRequest, @Param('userId') userId: string) {
    return this.safety.block(request.user.id, userId)
  }

  @Delete('blocks/:userId')
  unblock(@Req() request: AuthenticatedRequest, @Param('userId') userId: string) {
    return this.safety.unblock(request.user.id, userId)
  }

  @Post('reports')
  report(@Req() request: AuthenticatedRequest, @Body() input: CreateReportDto) {
    return this.safety.report(request.user.id, input)
  }

  @Get('reports')
  @UseGuards(ModeratorGuard)
  reports(@Query() query: ReportQueryDto) {
    return this.safety.listReports(query.status)
  }

  @Patch('reports/:id')
  @UseGuards(ModeratorGuard)
  resolve(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: ResolveReportDto) {
    return this.safety.resolveReport(request.user.id, id, input)
  }
}

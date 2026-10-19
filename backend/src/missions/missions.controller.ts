import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { MissionStatus } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import { OptionalAuthGuard } from '../auth/optional-auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { enforceRateLimit } from '../common/rate-limit'
import {
  CreateMissionDto,
  MissionListQuery,
  ModerateMissionDto,
  ReasonDto,
  ReportMissionDto,
  ToggleStaffVerificationDto,
  UpdateMissionDto
} from './dto'
import { MissionsService } from './missions.service'

@ApiTags('missions')
@Controller('missions')
export class MissionsController {
  constructor(private readonly missions: MissionsService) {}

  /** Discovery. Public, because a mission is meant to be found. */
  @Get()
  @UseGuards(OptionalAuthGuard)
  list(
    @Req() req: { user?: { id: string } },
    @Query() query: MissionListQuery
  ) {
    return this.missions.listMissions(query, req.user?.id)
  }

  @Get('badges')
  badges() {
    return this.missions.badgeCatalogue()
  }

  @Get('contributions')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  contributions(@Req() req: AuthenticatedRequest) {
    return this.missions.myContributions(req.user.id)
  }

  @Get('organizer')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  mine(@Req() req: AuthenticatedRequest, @Query() query: MissionListQuery) {
    return this.missions.listMissions({ ...query, mine: true }, req.user.id)
  }

  @Get('joined')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  joined(@Req() req: AuthenticatedRequest, @Query() query: MissionListQuery) {
    return this.missions.listMissions({ ...query, joined: true }, req.user.id)
  }

  @Get('staff/queue')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  queue(@Req() req: AuthenticatedRequest) {
    return this.missions.moderationQueue(req.user.id)
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async create(@Req() req: AuthenticatedRequest, @Body() input: CreateMissionDto) {
    await enforceRateLimit('missions', req.user.id)
    return this.missions.createMission(req.user.id, input)
  }

  /**
   * Mission detail. Drafts and archived missions 404 for everyone but their
   * organizer, so a draft cannot be discovered by guessing an id.
   */
  @Get(':missionId')
  @UseGuards(OptionalAuthGuard)
  detail(@Req() req: { user?: { id: string } }, @Param('missionId', ParseUUIDPipe) missionId: string) {
    return this.missions.publicMission(missionId, req.user?.id)
  }

  @Patch(':missionId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  update(
    @Req() req: AuthenticatedRequest,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Body() input: UpdateMissionDto
  ) {
    return this.missions.updateMission(req.user.id, missionId, input)
  }

  /** Lifecycle: publish, cancel, complete, or archive. */
  @Post(':missionId/status')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  setStatus(
    @Req() req: AuthenticatedRequest,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Body() body: { status: MissionStatus; note?: string }
  ) {
    return this.missions.transition(req.user.id, missionId, body.status, body.note)
  }

  @Post(':missionId/join')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  async join(
    @Req() req: AuthenticatedRequest,
    @Param('missionId', ParseUUIDPipe) missionId: string
  ) {
    await enforceRateLimit('missions', req.user.id)
    return this.missions.join(req.user.id, missionId)
  }

  @Post(':missionId/leave')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  leave(
    @Req() req: AuthenticatedRequest,
    @Param('missionId', ParseUUIDPipe) missionId: string
  ) {
    return this.missions.leave(req.user.id, missionId)
  }

  @Post(':missionId/check-in')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  checkIn(
    @Req() req: AuthenticatedRequest,
    @Param('missionId', ParseUUIDPipe) missionId: string
  ) {
    return this.missions.checkIn(req.user.id, missionId)
  }

  /** The roster. Participant-only, because attendance is not public. */
  @Get(':missionId/participants')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  participants(
    @Req() req: AuthenticatedRequest,
    @Param('missionId', ParseUUIDPipe) missionId: string
  ) {
    return this.missions.participantList(missionId, req.user.id)
  }

  @Post(':missionId/participants/:participantId/approve')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  approve(
    @Req() req: AuthenticatedRequest,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Param('participantId', ParseUUIDPipe) participantId: string
  ) {
    return this.missions.approveParticipant(req.user.id, missionId, participantId)
  }

  @Post(':missionId/participants/:participantId/attendance')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  attendance(
    @Req() req: AuthenticatedRequest,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Param('participantId', ParseUUIDPipe) participantId: string
  ) {
    return this.missions.confirmAttendance(req.user.id, missionId, participantId)
  }

  /** Staff attendance confirmation, for a mission flagged as needing it. */
  @Post(':missionId/participants/:participantId/attendance-staff')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  staffAttendance(
    @Req() req: AuthenticatedRequest,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Param('participantId', ParseUUIDPipe) participantId: string
  ) {
    return this.missions.confirmAttendance(req.user.id, missionId, participantId, { asStaff: true })
  }

  /** Staff completion, the counterpart of staff attendance. */
  @Post(':missionId/complete-staff')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  completeStaff(
    @Req() req: AuthenticatedRequest,
    @Param('missionId', ParseUUIDPipe) missionId: string
  ) {
    return this.missions.completeMission(req.user.id, missionId, { asStaff: true })
  }

  @Post(':missionId/complete')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  complete(
    @Req() req: AuthenticatedRequest,
    @Param('missionId', ParseUUIDPipe) missionId: string
  ) {
    return this.missions.completeMission(req.user.id, missionId)
  }

  @Post(':missionId/participants/:participantId/revoke')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  revoke(
    @Req() req: AuthenticatedRequest,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body() input: ReasonDto
  ) {
    return this.missions.revokeVerification(req.user.id, participantId, input.reason)
  }

  @Post(':missionId/participants/:participantId/revoke-staff')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  revokeStaff(
    @Req() req: AuthenticatedRequest,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body() input: ReasonDto
  ) {
    return this.missions.revokeVerification(req.user.id, participantId, input.reason, { asStaff: true })
  }

  @Post(':missionId/report')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async report(
    @Req() req: AuthenticatedRequest,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Body() input: ReportMissionDto
  ) {
    await enforceRateLimit('reports', req.user.id)
    return this.missions.reportMission(req.user.id, missionId, input.reportReason, input.details)
  }

  // ------------------------------------------------------------------- staff

  @Post('staff/:missionId/moderate')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  moderate(
    @Req() req: AuthenticatedRequest,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Body() input: ModerateMissionDto
  ) {
    return this.missions.moderateMission(req.user.id, missionId, input.action, input.note ?? '')
  }

  @Post('staff/:missionId/staff-verification')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  staffVerification(
    @Req() req: AuthenticatedRequest,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Body() input: ToggleStaffVerificationDto
  ) {
    return this.missions.requireStaffVerification(req.user.id, missionId, input.required)
  }

  /** The reminder sweep, exposed so it can be driven on demand and in tests. */
  @Post('staff/reminders/run')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  async runReminders(@Req() req: AuthenticatedRequest) {
    await this.missions.moderationQueue(req.user.id)
    return this.missions.sendUpcomingReminders()
  }
}
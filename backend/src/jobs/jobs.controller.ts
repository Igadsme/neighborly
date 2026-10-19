import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { enforceRateLimit } from '../common/rate-limit'
import { ApplyJobDto, CreateJobDto, ListJobsQuery, UpdateJobDto } from './dto'
import { JobsService } from './jobs.service'

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  list(@Query() query: ListJobsQuery) {
    return this.jobs.list(query)
  }

  @Get('saved')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  saved(@Req() request: AuthenticatedRequest) {
    return this.jobs.listSaved(request.user.id)
  }

  @Get('applications')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  myApplications(@Req() request: AuthenticatedRequest) {
    return this.jobs.listMyApplications(request.user.id)
  }

  @Get(':id/applications')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  applicants(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.listApplicants(request.user.id, id)
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.get(id)
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async create(@Req() request: AuthenticatedRequest, @Body() input: CreateJobDto) {
    await enforceRateLimit('jobs', request.user.id)
    return this.jobs.create(request.user.id, input)
  }

  @Post(':id/apply')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async apply(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() input: ApplyJobDto) {
    await enforceRateLimit('jobs', request.user.id)
    return this.jobs.apply(request.user.id, id, input)
  }

  @Post(':id/save')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async save(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    await enforceRateLimit('jobs', request.user.id)
    return this.jobs.toggleSave(request.user.id, id)
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async update(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() input: UpdateJobDto) {
    await enforceRateLimit('jobs', request.user.id)
    return this.jobs.update(request.user.id, id, input)
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async archive(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    await enforceRateLimit('jobs', request.user.id)
    return this.jobs.archive(request.user.id, id)
  }
}

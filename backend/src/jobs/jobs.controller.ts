import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
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
  applicants(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.jobs.listApplicants(request.user.id, id)
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.jobs.get(id)
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  create(@Req() request: AuthenticatedRequest, @Body() input: CreateJobDto) {
    return this.jobs.create(request.user.id, input)
  }

  @Post(':id/apply')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  apply(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: ApplyJobDto) {
    return this.jobs.apply(request.user.id, id, input)
  }

  @Post(':id/save')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  save(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.jobs.toggleSave(request.user.id, id)
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  update(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: UpdateJobDto) {
    return this.jobs.update(request.user.id, id, input)
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  archive(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.jobs.archive(request.user.id, id)
  }
}

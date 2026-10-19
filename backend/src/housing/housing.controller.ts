import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { enforceRateLimit } from '../common/rate-limit'
import { CreateHousingDto, ListHousingQuery, UpdateHousingDto } from './dto'
import { HousingService } from './housing.service'

@ApiTags('housing')
@Controller('housing')
export class HousingController {
  constructor(private readonly housing: HousingService) {}

  @Get()
  list(@Query() query: ListHousingQuery) {
    return this.housing.list(query)
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.housing.get(id)
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async create(@Req() request: AuthenticatedRequest, @Body() input: CreateHousingDto) {
    await enforceRateLimit('housing', request.user.id)
    return this.housing.create(request.user.id, input)
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async update(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() input: UpdateHousingDto) {
    await enforceRateLimit('housing', request.user.id)
    return this.housing.update(request.user.id, id, input)
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async archive(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    await enforceRateLimit('housing', request.user.id)
    return this.housing.archive(request.user.id, id)
  }
}

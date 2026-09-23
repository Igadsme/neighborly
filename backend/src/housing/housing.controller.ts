import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
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
  get(@Param('id') id: string) {
    return this.housing.get(id)
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  create(@Req() request: AuthenticatedRequest, @Body() input: CreateHousingDto) {
    return this.housing.create(request.user.id, input)
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  update(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: UpdateHousingDto) {
    return this.housing.update(request.user.id, id, input)
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  archive(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.housing.archive(request.user.id, id)
  }
}

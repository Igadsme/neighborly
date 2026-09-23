import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { CreateQuoteDto, CreateServiceDto, ListServicesQuery, UpdateServiceDto } from './dto'
import { ServicesService } from './services.service'

@ApiTags('services')
@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  list(@Query() query: ListServicesQuery) {
    return this.services.list(query)
  }

  @Get('quotes/mine')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  myQuotes(@Req() request: AuthenticatedRequest) {
    return this.services.listMyQuotes(request.user.id)
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.services.get(id)
  }

  @Get(':id/quotes')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  quotes(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.services.listQuotesForProvider(request.user.id, id)
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  create(@Req() request: AuthenticatedRequest, @Body() input: CreateServiceDto) {
    return this.services.create(request.user.id, input)
  }

  @Post('quotes/:id/accept')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  accept(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.services.acceptQuote(request.user.id, id)
  }

  @Post(':id/quotes')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  quote(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: CreateQuoteDto) {
    return this.services.createQuote(request.user.id, id, input)
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  update(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: UpdateServiceDto) {
    return this.services.update(request.user.id, id, input)
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  archive(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.services.archive(request.user.id, id)
  }
}

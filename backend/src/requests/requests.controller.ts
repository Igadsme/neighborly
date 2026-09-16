import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { CounterOfferDto, CreateOfferDto, CreateRequestDto } from './dto'
import { RequestsService } from './requests.service'

@ApiTags('requests')
@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  list() { return this.requests.list() }

  @Post()
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  create(@Req() req: AuthenticatedRequest, @Body() input: CreateRequestDto) { return this.requests.create(req.user.id, input) }

  @Post('/offers/:id/counter')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  counter(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: CounterOfferDto) {
    return this.requests.counterOffer(req.user.id, id, input)
  }

  @Post(':id/offers')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  createOffer(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: CreateOfferDto) {
    return this.requests.createOffer(req.user.id, id, input)
  }
}

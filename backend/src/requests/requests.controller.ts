import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { CounterOfferDto, CreateOfferDto, CreateRequestDto, ListOffersQuery } from './dto'
import { RequestsService } from './requests.service'

@ApiTags('requests')
@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  list() { return this.requests.list() }

  @Get('offers')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  offers(@Req() req: AuthenticatedRequest, @Query() query: ListOffersQuery) {
    return this.requests.listOffers(req.user.id, query.scope ?? 'received')
  }

  @Get(':id')
  get(@Param('id') id: string) { return this.requests.get(id) }

  @Post()
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  create(@Req() req: AuthenticatedRequest, @Body() input: CreateRequestDto) { return this.requests.create(req.user.id, input) }

  @Post(':id/offers/:offerId/accept')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  accept(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('offerId') offerId: string) {
    return this.requests.acceptOffer(req.user.id, offerId, id)
  }

  @Post(':id/offers/:offerId/reject')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  reject(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('offerId') offerId: string) {
    return this.requests.rejectOffer(req.user.id, offerId, id)
  }

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

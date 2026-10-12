import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { RequestStatus } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import { OptionalAuthGuard } from '../auth/optional-auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { enforceRateLimit } from '../common/rate-limit'
import { RequestLifecycleService } from './request-lifecycle.service'
import { RequestsService } from './requests.service'
import {
  CounterOfferDto,
  CreateOfferDto,
  CreateRequestDto,
  ListMyRequestsQuery,
  ListOffersQuery,
  ListRequestsQuery,
  SaveRequestDraftDto,
  UpdateRequestDto
} from './dto'

@ApiTags('requests')
@Controller('requests')
export class RequestsController {
  constructor(
    private readonly requests: RequestsService,
    private readonly lifecycle: RequestLifecycleService
  ) {}

  // ------------------------------------------------------------------ public

  @Get()
  list(@Query() query: ListRequestsQuery) {
    return this.lifecycle.list(query)
  }

  @Get('offers')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  offers(@Req() req: AuthenticatedRequest, @Query() query: ListOffersQuery) {
    return this.requests.listOffers(req.user.id, query.scope ?? 'received', query)
  }

  @Get('mine')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  mine(@Req() req: AuthenticatedRequest, @Query() query: ListMyRequestsQuery) {
    return this.lifecycle.listMine(req.user.id, query)
  }

  /** Drafts are invisible here unless the caller owns them. */
  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  async get(@Req() req: { user?: { id: string } }, @Param('id', ParseUUIDPipe) id: string) {
    return req.user ? this.lifecycle.getForOwner(req.user.id, id) : this.lifecycle.get(id)
  }

  @Get(':id/offers')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  offersForRequest(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListOffersQuery
  ) {
    return this.requests.listOffersForRequest(req.user.id, id, query)
  }

  @Get(':id/status-history')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  statusHistory(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.lifecycle.statusHistory(req.user.id, id)
  }

  // ---------------------------------------------------------------- lifecycle

  @Post()
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async create(@Req() req: AuthenticatedRequest, @Body() input: CreateRequestDto) {
    await enforceRateLimit('requests', req.user.id)
    return this.lifecycle.create(req.user.id, input, input.publish !== false)
  }

  @Post('drafts')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async saveDraft(@Req() req: AuthenticatedRequest, @Body() input: SaveRequestDraftDto) {
    await enforceRateLimit('requests', req.user.id)
    return this.lifecycle.saveDraft(req.user.id, input)
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateRequestDto
  ) {
    return this.lifecycle.update(req.user.id, id, input)
  }

  /** One endpoint for every legal status move; the state machine decides. */
  @Post(':id/status')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  transition(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { status: RequestStatus; note?: string }
  ) {
    return this.lifecycle.transition(req.user.id, id, body.status, body.note)
  }

  @Post(':id/publish')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  publish(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.lifecycle.transition(req.user.id, id, RequestStatus.PUBLISHED)
  }

  @Post(':id/pause')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  pause(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.lifecycle.transition(req.user.id, id, RequestStatus.PAUSED)
  }

  @Post(':id/resume')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  resume(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.lifecycle.transition(req.user.id, id, RequestStatus.PUBLISHED)
  }

  @Post(':id/fulfill')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  fulfill(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.lifecycle.transition(req.user.id, id, RequestStatus.FULFILLED)
  }

  @Post(':id/cancel')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  cancel(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.lifecycle.transition(req.user.id, id, RequestStatus.CANCELLED)
  }

  // ----------------------------------------------------------------- matching

  @Get(':id/matches')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  matches(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number
  ) {
    return this.lifecycle.matches(req.user.id, id, limit ?? 20)
  }

  // ------------------------------------------------------------------- offers

  @Post(':id/offers')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async createOffer(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CreateOfferDto
  ) {
    await enforceRateLimit('offers', req.user.id)
    return this.requests.createOffer(req.user.id, id, input)
  }

  @Get('offers/:offerId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  getOffer(@Req() req: AuthenticatedRequest, @Param('offerId', ParseUUIDPipe) offerId: string) {
    return this.requests.getOffer(req.user.id, offerId)
  }

  @Patch('offers/:offerId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  updateOffer(
    @Req() req: AuthenticatedRequest,
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @Body() input: { amountCents?: number; message?: string; listingIds?: string[] }
  ) {
    return this.requests.editOffer(req.user.id, offerId, input)
  }

  @Post('offers/:offerId/withdraw')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  withdrawOffer(@Req() req: AuthenticatedRequest, @Param('offerId', ParseUUIDPipe) offerId: string) {
    return this.requests.withdrawOffer(req.user.id, offerId)
  }

  @Post('offers/:offerId/counter')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async counter(@Req() req: AuthenticatedRequest, @Param('offerId', ParseUUIDPipe) id: string, @Body() input: CounterOfferDto) {
    await enforceRateLimit('offers', req.user.id)
    return this.requests.counterOffer(req.user.id, id, input)
  }

  @Post(':id/offers/:offerId/accept')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  accept(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('offerId', ParseUUIDPipe) offerId: string
  ) {
    return this.requests.acceptOffer(req.user.id, offerId, id)
  }

  @Post(':id/offers/:offerId/reject')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  reject(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('offerId', ParseUUIDPipe) offerId: string
  ) {
    return this.requests.rejectOffer(req.user.id, offerId, id)
  }
}

export { Delete }
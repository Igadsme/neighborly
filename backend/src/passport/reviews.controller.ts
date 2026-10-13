import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ReportReason } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { enforceRateLimit } from '../common/rate-limit'
import { CreateReviewDto, UpdateReviewDto } from './dto'
import { PassportService } from './passport.service'
import { ReviewsService } from './reviews.service'

@ApiTags('reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly passport: PassportService
  ) {}

  /** Public: what a passer-by can read about a member. */
  @Get('subjects/:subjectId')
  forSubject(@Param('subjectId', ParseUUIDPipe) subjectId: string) {
    return this.reviews.listForSubject(subjectId)
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async create(@Req() req: AuthenticatedRequest, @Body() input: CreateReviewDto) {
    await enforceRateLimit('reviews', req.user.id)
    return this.reviews.createReview(req.user.id, input)
  }

  /** The caller's own reviews, with their publication state explained. */
  @Get('mine')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  mine(@Req() req: AuthenticatedRequest) {
    return this.reviews.myReviews(req.user.id)
  }

  /** Completed exchanges this member has not yet reviewed. */
  @Get('reviewable')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  reviewable(@Req() req: AuthenticatedRequest) {
    return this.reviews.reviewableExchanges(req.user.id)
  }

  @Get(':reviewId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  get(@Req() req: AuthenticatedRequest, @Param('reviewId', ParseUUIDPipe) reviewId: string) {
    return this.reviews.describe(req.user.id, reviewId)
  }

  @Patch(':reviewId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  update(
    @Req() req: AuthenticatedRequest,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() input: UpdateReviewDto
  ) {
    return this.reviews.updateReview(req.user.id, reviewId, input)
  }

  @Post(':reviewId/report')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async report(
    @Req() req: AuthenticatedRequest,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() body: { reason: ReportReason; details?: string }
  ) {
    await enforceRateLimit('reports', req.user.id)
    return this.reviews.reportReview(req.user.id, reviewId, body.reason, body.details)
  }
}

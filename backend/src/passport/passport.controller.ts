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
import { AppealStatus, VerificationStatus } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import { OptionalAuthGuard } from '../auth/optional-auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { enforceRateLimit } from '../common/rate-limit'
import {
  ListPassportsQuery,
  PassportPrivacyDto,
  ResolveAppealDto,
  ReviewVerificationDto,
  SubmitAppealDto,
  SubmitVerificationDto,
  UpdatePassportProfileDto
} from './dto'
import { PassportService } from './passport.service'
import { ReviewsService } from './reviews.service'

@ApiTags('passport')
@Controller('passport')
export class PassportController {
  constructor(
    private readonly passport: PassportService,
    private readonly reviews: ReviewsService
  ) {}

  /**
   * Public passport. The viewer's own passport needs no token; another's needs
   * no token either, because it is public by design. The projection is built
   * from an explicit field list in the service.
   */
  @Get('members/:userId')
  @UseGuards(OptionalAuthGuard)
  member(
    @Req() req: { user?: { id: string } },
    @Param('userId', ParseUUIDPipe) userId: string
  ) {
    return this.passport.passport(userId, req.user?.id)
  }

  @Get('leaderboard')
  leaderboard(@Query() query: ListPassportsQuery) {
    return this.passport.leaderboard(query)
  }

  // ------------------------------------------------------------------ privacy

  @Get('privacy')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  privacy(@Req() req: AuthenticatedRequest) {
    return this.passport.privacy(req.user.id)
  }

  @Patch('privacy')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  updatePrivacy(@Req() req: AuthenticatedRequest, @Body() input: PassportPrivacyDto) {
    return this.passport.updatePrivacy(req.user.id, input)
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  me(@Req() req: AuthenticatedRequest) {
    return this.passport.passport(req.user.id, req.user.id)
  }

  @Patch('me')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  updateProfile(@Req() req: AuthenticatedRequest, @Body() input: UpdatePassportProfileDto) {
    return this.passport.updateProfile(req.user.id, input)
  }

  @Get('me/audit')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  audit(@Req() req: AuthenticatedRequest) {
    return this.passport.auditTrail(req.user.id)
  }

  // ------------------------------------------------------------ verification

  @Get('me/verifications')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  verifications(@Req() req: AuthenticatedRequest) {
    return this.passport.myVerifications(req.user.id)
  }

  @Post('verifications')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async submitVerification(@Req() req: AuthenticatedRequest, @Body() input: SubmitVerificationDto) {
    await enforceRateLimit('reviews', req.user.id)
    return this.passport.submitVerification(req.user.id, input)
  }

  // ----------------------------------------------------------------- appeals

  @Get('me/appeals')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  appeals(@Req() req: AuthenticatedRequest) {
    return this.passport.myAppeals(req.user.id)
  }

  @Post('appeals')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async appeal(@Req() req: AuthenticatedRequest, @Body() input: SubmitAppealDto) {
    await enforceRateLimit('reviews', req.user.id)
    return this.passport.submitAppeal(req.user.id, input)
  }

  // ------------------------------------------------------- staff moderation

  /**
   * Every staff route goes through the one assertion in PassportService, so
   * there is exactly one definition of who counts as staff.
   */
  @Get('staff/verifications')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  pendingVerifications(@Req() req: AuthenticatedRequest) {
    return this.passport.listPendingVerifications(req.user.id)
  }

  @Post('staff/verifications/:recordId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  reviewVerification(
    @Req() req: AuthenticatedRequest,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @Body() input: ReviewVerificationDto
  ) {
    return this.passport.reviewVerification(req.user.id, recordId, input)
  }

  @Get('staff/reviews')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  reviewQueue(@Req() req: AuthenticatedRequest) {
    return this.reviews.moderationQueue(req.user.id)
  }

  @Post('staff/reviews/:reviewId/hide')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  hideReview(
    @Req() req: AuthenticatedRequest,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() body: { reason: string }
  ) {
    return this.reviews.hideReview(req.user.id, reviewId, body.reason)
  }

  @Post('staff/reviews/:reviewId/restore')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  restoreReview(
    @Req() req: AuthenticatedRequest,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() body: { reason: string }
  ) {
    return this.reviews.restoreReview(req.user.id, reviewId, body.reason)
  }

  @Get('staff/appeals')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  appealQueue(@Req() req: AuthenticatedRequest, @Query('status') status?: AppealStatus) {
    return this.passport.listAppealsForStaff(req.user.id, status)
  }

  @Post('staff/appeals/:appealId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  resolveAppeal(
    @Req() req: AuthenticatedRequest,
    @Param('appealId', ParseUUIDPipe) appealId: string,
    @Body() input: ResolveAppealDto
  ) {
    return this.passport.resolveAppeal(req.user.id, appealId, input)
  }

  /** The publication sweep, exposed so it can be driven on demand. */
  @Post('staff/reviews/publish-due')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  async publishDue(@Req() req: AuthenticatedRequest) {
    await this.passport.assertStaff(req.user.id)
    return { published: await this.reviews.publishDueReviews() }
  }
}

export { VerificationStatus }
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { CreateReviewDto } from './dto'
import { ReviewsService } from './reviews.service'

@ApiTags('reviews')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() input: CreateReviewDto) {
    return this.reviews.createReview(req.user.id, input)
  }
}

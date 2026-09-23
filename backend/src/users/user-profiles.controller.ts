import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ReviewsService } from '../reviews/reviews.service'
import { UsersService } from './users.service'

@ApiTags('users')
@Controller('users')
export class UserProfilesController {
  constructor(
    private readonly users: UsersService,
    private readonly reviewsService: ReviewsService
  ) {}

  @Get(':id/profile')
  profile(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.publicProfile(id)
  }

  @Get(':id/reviews')
  reviews(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviewsService.listForSubject(id)
  }
}

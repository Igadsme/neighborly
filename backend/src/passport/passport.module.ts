import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { PassportController } from './passport.controller'
import { PassportService } from './passport.service'
import { ReviewsController } from './reviews.controller'
import { ReviewsService } from './reviews.service'

/**
 * Milestone 8 replaces the Milestone 1 review endpoint rather than sitting
 * beside it: there is one review table, one publication policy, and one
 * moderation surface. The old `reviews` module is removed rather than kept
 * in parallel.
 */
@Module({
  imports: [AuthModule],
  controllers: [PassportController, ReviewsController],
  providers: [PassportService, ReviewsService],
  exports: [PassportService, ReviewsService]
})
export class PassportModule {}

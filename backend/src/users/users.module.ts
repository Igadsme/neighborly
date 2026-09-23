import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { ReviewsModule } from '../reviews/reviews.module'
import { UserProfilesController } from './user-profiles.controller'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'

@Module({
  imports: [AuthModule, ReviewsModule],
  controllers: [UsersController, UserProfilesController],
  providers: [UsersService]
})
export class UsersModule {}

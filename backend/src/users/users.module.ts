import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { PassportModule } from '../passport/passport.module'
import { AccountService } from './account.service'
import { UserProfilesController } from './user-profiles.controller'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'

@Module({
  imports: [AuthModule, PassportModule],
  controllers: [UsersController, UserProfilesController],
  providers: [UsersService, AccountService],
  exports: [UsersService, AccountService]
})
export class UsersModule {}

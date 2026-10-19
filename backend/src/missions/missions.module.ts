import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { EventsModule } from '../events/events.module'
import { PassportModule } from '../passport/passport.module'
import { MissionsController } from './missions.controller'
import { MissionsService } from './missions.service'

/**
 * Milestone 9 reuses Milestone 8's staff assertion rather than defining a
 * second one, so "who counts as staff" has a single answer across moderation.
 */
@Module({
  imports: [AuthModule, EventsModule, PassportModule],
  controllers: [MissionsController],
  providers: [MissionsService],
  exports: [MissionsService]
})
export class MissionsModule {}

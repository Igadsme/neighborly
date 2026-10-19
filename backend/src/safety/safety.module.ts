import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { ModerationController } from './moderation.controller'
import { SafetyController } from './safety.controller'
import { SafetyService } from './safety.service'

@Module({
  imports: [AuthModule],
  controllers: [SafetyController, ModerationController],
  providers: [SafetyService]
})
export class SafetyModule {}

import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { SafetyController } from './safety.controller'
import { ModeratorGuard } from './moderator.guard'
import { SafetyService } from './safety.service'

@Module({
  imports: [AuthModule],
  controllers: [SafetyController],
  providers: [SafetyService, ModeratorGuard],
  exports: [SafetyService],
})
export class SafetyModule {}

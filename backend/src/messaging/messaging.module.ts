import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { MessagingController } from './messaging.controller'
import { MessagingGateway } from './messaging.gateway'
import { MessagingService } from './messaging.service'
import { SafetyModule } from '../safety/safety.module'

@Module({
  imports: [AuthModule, NotificationsModule, SafetyModule],
  controllers: [MessagingController],
  providers: [MessagingService, MessagingGateway],
  exports: [MessagingService, MessagingGateway]
})
export class MessagingModule {}

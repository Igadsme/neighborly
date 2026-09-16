import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MessagingController } from './messaging.controller'
import { MessagingGateway } from './messaging.gateway'
import { MessagingService } from './messaging.service'

@Module({
  imports: [AuthModule],
  controllers: [MessagingController],
  providers: [MessagingService, MessagingGateway],
  exports: [MessagingService, MessagingGateway]
})
export class MessagingModule {}

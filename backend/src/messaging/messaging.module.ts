import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MessagingController } from './messaging.controller'
import { MessagingGateway } from './messaging.gateway'
import { MessagingService } from './messaging.service'
import { SocketRedis } from './socket-redis'

@Module({
  imports: [AuthModule],
  controllers: [MessagingController],
  providers: [MessagingService, MessagingGateway, SocketRedis],
  exports: [MessagingService, MessagingGateway, SocketRedis]
})
export class MessagingModule {}

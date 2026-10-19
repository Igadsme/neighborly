import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { RequestsController } from './requests.controller'
import { RequestsService } from './requests.service'
import { SafetyModule } from '../safety/safety.module'

@Module({ imports: [AuthModule, NotificationsModule, SafetyModule], controllers: [RequestsController], providers: [RequestsService] })
export class RequestsModule {}

import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { RequestLifecycleService } from './request-lifecycle.service'
import { RequestsController } from './requests.controller'
import { RequestsService } from './requests.service'

@Module({
  imports: [AuthModule],
  controllers: [RequestsController],
  providers: [RequestsService, RequestLifecycleService],
  exports: [RequestsService, RequestLifecycleService]
})
export class RequestsModule {}

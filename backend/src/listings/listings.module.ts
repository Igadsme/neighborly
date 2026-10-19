import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { StorageModule } from '../storage/storage.module'
import { ListingsController } from './listings.controller'
import { ListingsService } from './listings.service'

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [ListingsController],
  providers: [ListingsService]
})
export class ListingsModule {}

import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { StorageModule } from '../storage/storage.module'
import { BorrowController } from './borrow.controller'
import { BorrowService } from './borrow.service'

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [BorrowController],
  providers: [BorrowService],
  exports: [BorrowService]
})
export class BorrowModule {}

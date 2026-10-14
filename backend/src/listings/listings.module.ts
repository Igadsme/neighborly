import { Module } from '@nestjs/common'
import { StorageModule } from '../storage/storage.module'
import { AuthModule } from '../auth/auth.module'
import { ListingsController } from './listings.controller'
import { ListingsService } from './listings.service'

@Module({
  // AuthModule provides AuthGuard and JwtService, which the controller's
  // @UseGuards(AuthGuard) resolves through dependency injection. Without this
  // import the application fails to start with an UnknownDependenciesException,
  // because AuthGuard is only provided inside AuthModule's own scope.
  imports: [AuthModule, StorageModule],
  controllers: [ListingsController],
  providers: [ListingsService],
  exports: [ListingsService]
})
export class ListingsModule {}
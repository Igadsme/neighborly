import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { HousingController } from './housing.controller'
import { HousingService } from './housing.service'

@Module({
  imports: [AuthModule],
  controllers: [HousingController],
  providers: [HousingService]
})
export class HousingModule {}

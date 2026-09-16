import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { envValidationSchema } from './common/config/env.validation'
import { AuthModule } from './auth/auth.module'
import { HealthModule } from './health/health.module'
import { ListingsModule } from './listings/listings.module'
import { PrismaModule } from './prisma/prisma.module'
import { RequestsModule } from './requests/requests.module'
import { TransactionsModule } from './transactions/transactions.module'
import { MessagingModule } from './messaging/messaging.module'
import { UsersModule } from './users/users.module'
import { CategoriesModule } from './categories/categories.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validationSchema: envValidationSchema }),
    PrismaModule,
    HealthModule,
    AuthModule,
    ListingsModule,
    RequestsModule,
    TransactionsModule,
    MessagingModule,
    UsersModule,
    CategoriesModule
  ]
})
export class AppModule {}

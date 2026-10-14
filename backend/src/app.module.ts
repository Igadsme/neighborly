import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { envValidationSchema } from './common/config/env.validation'
import { AuthModule } from './auth/auth.module'
import { HealthModule } from './health/health.module'
import { ListingsModule } from './listings/listings.module'
import { PrismaModule } from './prisma/prisma.module'
import { RequestsModule } from './requests/requests.module'
import { PassportModule } from './passport/passport.module'
import { TransactionsModule } from './transactions/transactions.module'
import { MessagingModule } from './messaging/messaging.module'
import { UsersModule } from './users/users.module'
import { CategoriesModule } from './categories/categories.module'
import { CommunityModule } from './community/community.module'
import { SafetyModule } from './safety/safety.module'
import { HousingModule } from './housing/housing.module'
import { JobsModule } from './jobs/jobs.module'
import { ServicesModule } from './services/services.module'
import { StorageModule } from './storage/storage.module'
import { EventsModule } from './events/events.module'
import { BorrowModule } from './borrow/borrow.module'
import { MissionsModule } from './missions/missions.module'
import { NotificationsModule } from './notifications/notifications.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validationSchema: envValidationSchema }),
    PrismaModule,
    EventsModule,
    BorrowModule,
    MissionsModule,
    HealthModule,
    AuthModule,
    ListingsModule,
    RequestsModule,
    PassportModule,
    TransactionsModule,
    MessagingModule,
    UsersModule,
    CategoriesModule,
    HousingModule,
    JobsModule,
    ServicesModule,
    CommunityModule,
    SafetyModule,
    StorageModule,
    NotificationsModule
  ]
})
export class AppModule {}

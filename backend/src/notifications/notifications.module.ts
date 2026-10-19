import { Injectable, Logger, Module, OnModuleInit } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { BorrowModule } from '../borrow/borrow.module'
import { MissionsModule } from '../missions/missions.module'
import { PassportModule } from '../passport/passport.module'
import { ReviewsService } from '../passport/reviews.service'
import { MissionsService } from '../missions/missions.service'
import { BorrowService } from '../borrow/borrow.service'
import { MessagingGateway } from '../messaging/messaging.gateway'
import { MessagingModule } from '../messaging/messaging.module'
import { NotificationWorker } from './notification-worker'
import { NotificationsController } from './notifications.controller'
import { NotificationsService } from './notifications.service'
import { SavedSearchAlertWorker } from './saved-search-worker'

/**
 * Notifications are materialized by a poller over the durable outbox rather
 * than an in-process emitter, so an event cannot be lost between the
 * business commit and delivery.
 *
 * The workers are driven by `onApplicationBootstrap` and then by a periodic
 * tick. The tick is the durability guarantee: if the process dies mid-run,
 * the `PENDING` rows simply stay pending and the next tick picks them up.
 */
@Injectable()
export class NotificationDispatcher implements OnModuleInit {
  private readonly logger = new Logger(NotificationDispatcher.name)
  private timer?: NodeJS.Timeout
  /** Only listings newer than this are evaluated, so the scan stays bounded. */
  private savedSearchWatermark = new Date()
  private lastSavedSearchRun = 0
  private readonly savedSearchIntervalMs = Number(process.env.SAVED_SEARCH_POLL_MS ?? 60_000)
  private readonly pollMs = Number(process.env.NOTIFICATION_POLL_MS ?? 5000)
  private lastOverdueRun = 0
  private readonly overdueIntervalMs = Number(process.env.BORROW_OVERDUE_POLL_MS ?? 300_000)
  private lastReviewPublish = 0
  private readonly reviewPublishIntervalMs = Number(process.env.REVIEW_PUBLISH_POLL_MS ?? 600_000)
  private lastMissionReminder = 0
  private readonly missionReminderIntervalMs = Number(process.env.MISSION_REMINDER_POLL_MS ?? 3_600_000)

  constructor(
    private readonly worker: NotificationWorker,
    private readonly savedSearch: SavedSearchAlertWorker,
    private readonly gateway: MessagingGateway,
    private readonly borrow: BorrowService,
    private readonly reviews: ReviewsService,
    private readonly missions: MissionsService
  ) {}

  onModuleInit() {
    // A first drain shortly after boot, then a steady interval. The interval
    // is intentionally modest: correctness comes from the rows, not from how
    // often they are polled.
    const intervalMs = this.pollMs
    if (Number.isFinite(intervalMs) && intervalMs > 0) {
      this.timer = setInterval(() => void this.tick(), intervalMs)
      // Do not hold the process open purely for the poller.
      this.timer.unref?.()
    }
    void this.tick()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  /**
   * Public so a caller (or a test) can drain on demand and assert the result.
   * Returns the number of outbox rows processed.
   */
  async tick(): Promise<number> {
    let processed = 0
    try {
      processed += await this.worker.drain(50)
    } catch (error) {
      this.logger.error('notification drain failed', error as Error)
    }

    // Saved searches are evaluated on a slower cadence, and only against
    // listings newer than the watermark, so a tick never scans history it
    // has already covered. The watermark advances even on an empty run.
    const now = new Date()
    if (now.getTime() - this.lastSavedSearchRun >= this.savedSearchIntervalMs) {
      this.lastSavedSearchRun = now.getTime()
      try {
        processed += await this.savedSearch.run({ since: this.savedSearchWatermark, limit: 200 })
        this.savedSearchWatermark = now
      } catch (error) {
        this.logger.error('saved-search evaluation failed', error as Error)
      }
    }
    // The overdue sweep is slower than the outbox drain because it changes
    // nothing when nothing is due. Its correctness comes from the conditional
    // claim inside the service, not from how often it runs, so a restart in
    // the middle of a sweep is safe.
    const nowMs = Date.now()
    if (nowMs - this.lastOverdueRun >= this.overdueIntervalMs) {
      this.lastOverdueRun = nowMs
      try {
        const overdue = await this.borrow.sweepOverdue(new Date(nowMs))
        if (overdue > 0) this.logger.log(`marked ${overdue} borrowings overdue`)
      } catch (error) {
        this.logger.error('borrow overdue sweep failed', error as Error)
      }
    }
    // Reviews publish on their own schedule, so this runs on the same cadence
    // as the overdue sweep: the correctness comes from the conditional claim
    // inside publishIfDue, not from how often it is called.
    const nowForReviews = Date.now()
    if (nowForReviews - this.lastReviewPublish >= this.reviewPublishIntervalMs) {
      this.lastReviewPublish = nowForReviews
      try {
        const published = await this.reviews.publishDueReviews(new Date(nowForReviews))
        if (published > 0) this.logger.log(`published ${published} reviews`)
      } catch (error) {
        this.logger.error('review publication sweep failed', error as Error)
      }
    }
    // Upcoming-mission reminders, bounded by the service itself so a slow or
    // repeatedly failing reminder cannot be triggered more often here.
    const nowForMissions = Date.now()
    if (nowForMissions - this.lastMissionReminder >= this.missionReminderIntervalMs) {
      this.lastMissionReminder = nowForMissions
      try {
        const sent = await this.missions.sendUpcomingReminders(new Date(nowForMissions))
        if (sent.reminders > 0) this.logger.log(`sent ${sent.reminders} mission reminders`)
      } catch (error) {
        this.logger.error('mission reminder sweep failed', error as Error)
      }
    }
    return processed
  }

  /**
   * Runs the overdue sweep on demand. Exposed so a test or a cron trigger can
   * assert the result without waiting for the interval.
   */
  async runOverdueSweep(now = new Date()): Promise<number> {
    return this.borrow.sweepOverdue(now)
  }

  /**
   * Re-evaluates from a given point. Exposed so a deployment can replay a
   * window without waiting for the interval.
   */
  async evaluateSavedSearches(since?: Date): Promise<number> {
    try {
      return await this.savedSearch.run({ since, limit: 200 })
    } catch (error) {
      this.logger.error('saved-search evaluation failed', error as Error)
      return 0
    }
  }
}

@Module({
  // AuthModule supplies AuthGuard and JwtService for the controller's guards.
  // None of the imported modules re-export AuthModule, so it must be imported
  // here or the application fails to start on dependency resolution.
  imports: [AuthModule, MessagingModule, BorrowModule, PassportModule, MissionsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationWorker, SavedSearchAlertWorker, NotificationDispatcher],
  exports: [NotificationsService, NotificationWorker, SavedSearchAlertWorker, NotificationDispatcher]
})
export class NotificationsModule {}
import { Injectable, Logger, Module, OnModuleInit } from '@nestjs/common'
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

  constructor(
    private readonly worker: NotificationWorker,
    private readonly savedSearch: SavedSearchAlertWorker,
    private readonly gateway: MessagingGateway
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
    return processed
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
  imports: [MessagingModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationWorker, SavedSearchAlertWorker, NotificationDispatcher],
  exports: [NotificationsService, NotificationWorker, SavedSearchAlertWorker, NotificationDispatcher]
})
export class NotificationsModule {}
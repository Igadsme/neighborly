import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { audit } from '../common/logger'
import { PrismaService } from '../prisma/prisma.service'
import { MessagingGateway } from '../messaging/messaging.gateway'
import { DOMAIN_EVENTS } from '../events/domain-events'

export interface NotificationIntent {
  userId: string
  type: string
  title: string
  body?: string
  link?: string
  /** Stable across redelivery, so a retry cannot duplicate a notification. */
  dedupe: string[]
}

/** Which preference column governs which notification category. */
const PREFERENCE_BY_TYPE: Record<string, keyof PreferenceFlags> = {
  message: 'messages',
  offer_received: 'offers',
  offer_updated: 'offers',
  offer_accepted: 'offers',
  offer_rejected: 'offers',
  match_found: 'matches',
  saved_search_match: 'savedSearches',
  request_updated: 'requestUpdates',
  request_fulfilled: 'requestUpdates',
  transaction_updated: 'requestUpdates'
}

export interface PreferenceFlags {
  messages: boolean
  offers: boolean
  matches: boolean
  savedSearches: boolean
  requestUpdates: boolean
}

/**
 * Consumes the transactional outbox and materialises notifications.
 *
 * The design point is that this is a **poller over durable rows**, not an
 * in-process event emitter. A crash between the business commit and the
 * notification cannot lose the event, because the event row committed with
 * the business row. Processing is at-least-once, and the unique
 * `dedupeKey` on `Notification` makes it idempotent, so a redelivery is a
 * no-op rather than a duplicate.
 */
@Injectable()
export class NotificationWorker {
  private readonly logger = new Logger(NotificationWorker.name)
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: MessagingGateway
  ) {}

  /**
   * Claims and processes a batch. Safe to call concurrently: claiming uses a
   * conditional update, so two workers cannot take the same rows.
   */
  async drain(limit = 50): Promise<number> {
    if (this.running) return 0
    this.running = true
    try {
      const claimed = await this.claim(limit)
      for (const row of claimed) {
        try {
          await this.process(row)
          await this.prisma.domainEventOutbox.update({
            where: { id: row.id },
            data: { status: 'DELIVERED', processedAt: new Date(), attempts: { increment: 1 } }
          })
        } catch (error) {
          const attempts = row.attempts + 1
          // Exponential backoff, capped, so a poison event cannot spin.
          const backoffMinutes = Math.min(60, 2 ** Math.min(attempts, 6))
          await this.prisma.domainEventOutbox.update({
            where: { id: row.id },
            data: {
              status: attempts >= 5 ? 'FAILED' : 'PENDING',
              attempts,
              availableAt: new Date(Date.now() + backoffMinutes * 60_000),
              lastError: String(error).slice(0, 500)
            }
          })
          this.logger.error(`event ${row.type} failed on attempt ${attempts}`, error as Error)
        }
      }
      return claimed.length
    } finally {
      this.running = false
    }
  }

  /**
   * Selects candidates then claims each with a conditional update. The
   * `status: 'PENDING'` predicate is what makes concurrent workers safe.
   */
  private async claim(limit: number) {
    const candidates = await this.prisma.domainEventOutbox.findMany({
      where: { status: 'PENDING', availableAt: { lte: new Date() } },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true, type: true, payload: true, actorId: true, dedupeKey: true, attempts: true }
    })

    const claimed: typeof candidates = []
    for (const row of candidates) {
      const result = await this.prisma.domainEventOutbox.updateMany({
        where: { id: row.id, status: 'PENDING' },
        data: { status: 'PROCESSING' }
      })
      if (result.count === 1) claimed.push(row)
    }
    return claimed
  }

  private async process(row: {
    type: string
    payload: Prisma.JsonValue
    actorId: string | null
    dedupeKey: string | null
  }) {
    const intents = this.intentsFor(row)
    for (const intent of intents) {
      await this.notify(intent)
    }
  }

  /**
   * Maps a domain event to the notifications it should produce. Kept as one
   * pure function so the mapping can be unit-tested without a database.
   */
  intentsFor(row: {
    type: string
    payload: Prisma.JsonValue
    actorId: string | null
    dedupeKey?: string | null
  }): NotificationIntent[] {
    const payload = (row.payload ?? {}) as Record<string, unknown>
    const eventId = row.dedupeKey ?? row.type
    const actorId = row.actorId ?? undefined

    switch (row.type) {
      case DOMAIN_EVENTS.offerReceived:
        return [
          {
            userId: String(payload.requesterId ?? ''),
            type: 'offer_received',
            title: `New offer on "${payload.requestTitle ?? 'your request'}"`,
            body: 'Someone made you an offer.',
            link: `/requests/${payload.requestId}/offers`,
            dedupe: [eventId]
          }
        ].filter(intent => intent.userId)

      case DOMAIN_EVENTS.offerAccepted:
        return [
          {
            userId: String(payload.offererId ?? ''),
            type: 'offer_accepted',
            title: 'Your offer was accepted',
            body: 'The conversation and transaction are ready.',
            link: `/transactions/${payload.transactionId}`,
            dedupe: [eventId]
          }
        ].filter(intent => intent.userId)

      case DOMAIN_EVENTS.offerRejected:
        return [
          {
            userId: String(payload.offererId ?? ''),
            type: 'offer_rejected',
            title: 'Your offer was declined',
            link: `/requests/${payload.requestId}`,
            dedupe: [eventId]
          }
        ].filter(intent => intent.userId)

      case DOMAIN_EVENTS.offerUpdated:
        return [
          {
            userId: String(payload.requesterId ?? ''),
            type: 'offer_updated',
            title: 'An offer you received was updated',
            link: `/requests/${payload.requestId}/offers`,
            dedupe: [eventId]
          }
        ].filter(intent => intent.userId && intent.userId !== actorId)

      case DOMAIN_EVENTS.requestFulfilled:
        return [
          {
            userId: String(payload.requesterId ?? ''),
            type: 'request_fulfilled',
            title: 'Your request was fulfilled',
            link: `/requests/${payload.requestId}`,
            dedupe: [eventId]
          }
        ].filter(intent => intent.userId && intent.userId !== actorId)

      case DOMAIN_EVENTS.requestStatusChanged:
      case DOMAIN_EVENTS.requestUpdated:
        return [
          {
            userId: String(payload.requesterId ?? ''),
            type: 'request_updated',
            title: `Your request is now ${String(payload.to ?? 'updated')}`,
            link: `/requests/${payload.requestId}`,
            dedupe: [eventId]
          }
        ].filter(intent => intent.userId && intent.userId !== actorId)

      case DOMAIN_EVENTS.transactionStatusChanged:
        return (payload.participantIds as string[] | undefined ?? [])
          // Never notify someone about their own action.
          .filter(userId => userId && userId !== actorId)
          .map(userId => ({
            userId,
            type: 'transaction_updated',
            title: `Exchange moved to ${String(payload.to)}`,
            link: `/transactions/${payload.transactionId}`,
            dedupe: [eventId, userId]
          }))

      case DOMAIN_EVENTS.matchFound:
        // Handled by the saved-search alert worker, which evaluates the
        // persisted criteria rather than a single precomputed match.
        return []

      default:
        return []
    }
  }

  /** Writes one notification unless the preference or a duplicate blocks it. */
  async notify(intent: NotificationIntent) {
    const preferenceColumn = PREFERENCE_BY_TYPE[intent.type]
    if (preferenceColumn) {
      const preference = await this.prisma.notificationPreference.findUnique({
        where: { userId: intent.userId },
        select: { [preferenceColumn]: true } as never
      })
      if (preference && (preference as Record<string, unknown>)[preferenceColumn] === false) {
        audit('notification.preference_suppressed', { userId: intent.userId, type: intent.type })
        return null
      }
    }

    const key = ['notification', intent.type, ...intent.dedupe, intent.userId].join(':')
    try {
      const row = await this.prisma.notification.create({
        data: {
          userId: intent.userId,
          type: intent.type,
          title: intent.title.slice(0, 200),
          body: intent.body?.slice(0, 500),
          link: intent.link,
          dedupeKey: key
        }
      })
      audit('notification.created', { userId: intent.userId, type: intent.type })
      // Realtime push is best effort: the row is already durable, so a
      // disconnected client still sees it on its next fetch.
      this.realtime.publishNotification(intent.userId, row)
      return row
    } catch (error) {
      if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002') {
        // Already delivered. This is the idempotency guarantee, not a fault.
        audit('notification.deduplicated', { userId: intent.userId, type: intent.type })
        return null
      }
      throw error
    }
  }
}

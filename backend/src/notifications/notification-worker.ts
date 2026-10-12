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
  transaction_updated: 'requestUpdates',
  // Borrowing reuses the request-update preference: a borrower who does not
  // want to hear about their requests does not want to hear about a loan
  // either, and inventing a new category would silently opt them in.
  borrow_requested: 'requestUpdates',
  borrow_approved: 'requestUpdates',
  borrow_declined: 'requestUpdates',
  borrow_cancelled: 'requestUpdates',
  borrow_pickup_scheduled: 'requestUpdates',
  borrow_handoff_confirmed: 'requestUpdates',
  borrow_return_requested: 'requestUpdates',
  borrow_returned: 'requestUpdates',
  borrow_completed: 'requestUpdates',
  borrow_overdue: 'requestUpdates',
  borrow_extension_requested: 'requestUpdates',
  borrow_extension_decided: 'requestUpdates',
  borrow_dispute_opened: 'requestUpdates',
  borrow_dispute_updated: 'requestUpdates'
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

      // ---------------------------------------------------- borrowing
      //
      // Every borrow event names both parties, so the recipient is chosen by
      // role rather than by convention: the lender hears about requests and
      // approvals, the borrower hears about the rest, and neither is ever
      // told about their own action.
      case DOMAIN_EVENTS.borrowRequested:
        return [
          {
            userId: String(payload.lenderId ?? ''),
            type: 'borrow_requested',
            title: `New borrow request for "${payload.listingTitle ?? 'your item'}"`,
            body: 'A neighbor would like to borrow it.',
            link: `/borrow/requests/${payload.borrowRequestId}`,
            dedupe: [eventId]
          }
        ].filter(intent => intent.userId && intent.userId !== actorId)

      case DOMAIN_EVENTS.borrowApproved:
        return [
          {
            userId: String(payload.borrowerId ?? ''),
            type: 'borrow_approved',
            title: `Your borrow request was approved`,
            body: 'Arrange a pickup time with the lender.',
            link: `/borrow/requests/${payload.borrowRequestId}`,
            dedupe: [eventId]
          }
        ].filter(intent => intent.userId && intent.userId !== actorId)

      case DOMAIN_EVENTS.borrowDeclined:
        return [
          {
            userId: String(payload.borrowerId ?? ''),
            type: 'borrow_declined',
            title: 'Your borrow request was declined',
            link: `/borrow/requests/${payload.borrowRequestId}`,
            dedupe: [eventId]
          }
        ].filter(intent => intent.userId && intent.userId !== actorId)

      case DOMAIN_EVENTS.borrowCancelled:
        return [
          {
            userId: String(payload.borrowerId ?? ''),
            type: 'borrow_cancelled',
            title: 'A borrow request was cancelled',
            link: `/borrow/requests/${payload.borrowRequestId}`,
            dedupe: [eventId]
          },
          {
            userId: String(payload.lenderId ?? ''),
            type: 'borrow_cancelled',
            title: 'A borrow request was cancelled',
            link: `/borrow/requests/${payload.borrowRequestId}`,
            dedupe: [eventId, 'lender']
          }
        ].filter(intent => intent.userId && intent.userId !== actorId)

      case DOMAIN_EVENTS.borrowPickupScheduled:
        return [
          {
            userId: String(payload.borrowerId ?? ''),
            type: 'borrow_pickup_scheduled',
            title: 'A pickup was scheduled',
            // No location note: an event is addressed to a recipient, and
            // the pickup point is only for the two participants.
            body: `Expected ${String(payload.scheduledAt ?? '').slice(0, 16).replace('T', ' ')}`,
            link: `/borrow/requests/${payload.borrowRequestId}`,
            dedupe: [eventId]
          },
          {
            userId: String(payload.lenderId ?? ''),
            type: 'borrow_pickup_scheduled',
            title: 'A pickup was scheduled',
            body: `Expected ${String(payload.scheduledAt ?? '').slice(0, 16).replace('T', ' ')}`,
            link: `/borrow/requests/${payload.borrowRequestId}`,
            dedupe: [eventId, 'lender']
          }
        ].filter(intent => intent.userId && intent.userId !== actorId)

      case DOMAIN_EVENTS.borrowHandoffConfirmed:
        return [
          {
            userId: String(payload.borrowerId === actorId ? payload.lenderId : payload.borrowerId ?? ''),
            type: 'borrow_handoff_confirmed',
            title: 'The item was handed over',
            link: `/borrow/requests/${payload.borrowRequestId}`,
            dedupe: [eventId]
          }
        ].filter(intent => intent.userId && intent.userId !== actorId)

      case DOMAIN_EVENTS.borrowReturnRequested:
        return [
          {
            userId: String(payload.lenderId ?? ''),
            type: 'borrow_return_requested',
            title: 'The borrower says they are returning it',
            link: `/borrow/requests/${payload.borrowRequestId}`,
            dedupe: [eventId]
          }
        ].filter(intent => intent.userId && intent.userId !== actorId)

      case DOMAIN_EVENTS.borrowReturned:
        return [
          {
            userId: String(payload.borrowerId === actorId ? payload.lenderId : payload.borrowerId ?? ''),
            type: 'borrow_returned',
            title: 'The item was returned',
            link: `/borrow/requests/${payload.borrowRequestId}`,
            dedupe: [eventId]
          }
        ].filter(intent => intent.userId && intent.userId !== actorId)

      case DOMAIN_EVENTS.borrowCompleted:
        return [
          {
            userId: String(payload.borrowerId === actorId ? payload.lenderId : payload.borrowerId ?? ''),
            type: 'borrow_completed',
            title: 'A borrowing is complete',
            link: `/borrow/requests/${payload.borrowRequestId}`,
            dedupe: [eventId]
          }
        ].filter(intent => intent.userId && intent.userId !== actorId)

      case DOMAIN_EVENTS.borrowOverdue:
        // Both parties are told: the borrower needs the nudge, the lender
        // needs to know the item is out late.
        return [payload.borrowerId, payload.lenderId]
          .map((id, index) => ({
            userId: String(id ?? ''),
            type: 'borrow_overdue',
            title: 'A borrowed item is overdue',
            body: `It was due ${String(payload.endAt ?? '').slice(0, 10)}`,
            link: `/borrow/requests/${payload.borrowRequestId}`,
            dedupe: [eventId, String(index)]
          }))
          .filter(intent => intent.userId)

      case DOMAIN_EVENTS.borrowExtensionRequested:
        return [
          {
            userId: String(payload.lenderId ?? ''),
            type: 'borrow_extension_requested',
            title: 'A borrower asked for more time',
            link: `/borrow/requests/${payload.borrowRequestId}`,
            dedupe: [eventId]
          }
        ].filter(intent => intent.userId && intent.userId !== actorId)

      case DOMAIN_EVENTS.borrowExtensionDecided:
        return [
          {
            userId: String(payload.borrowerId ?? ''),
            type: 'borrow_extension_decided',
            title:
              String(payload.status) === 'APPROVED'
                ? 'Your extension was approved'
                : 'Your extension was declined',
            body: `New due date ${String(payload.requestedEndAt ?? '').slice(0, 10)}`,
            link: `/borrow/requests/${payload.borrowRequestId}`,
            dedupe: [eventId]
          }
        ].filter(intent => intent.userId && intent.userId !== actorId)

      case DOMAIN_EVENTS.borrowDisputeOpened:
        return [payload.lenderId, payload.borrowerId]
          .filter(id => id && id !== actorId)
          .map((id, index) => ({
            userId: String(id),
            type: 'borrow_dispute_opened',
            title: 'A dispute was opened on this borrowing',
            body: String(payload.reason ?? '').toLowerCase().replace('_', ' '),
            link: `/borrow/disputes/${payload.disputeId}`,
            dedupe: [eventId, String(index)]
          }))

      case DOMAIN_EVENTS.borrowDisputeUpdated:
        return [payload.lenderId, payload.borrowerId]
          .filter(id => id && id !== actorId)
          .map((id, index) => ({
            userId: String(id),
            type: 'borrow_dispute_updated',
            title: `Dispute is now ${String(payload.status ?? '').toLowerCase().replace('_', ' ')}`,
            link: `/borrow/disputes/${payload.disputeId}`,
            dedupe: [eventId, String(index)]
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

/**
 * Milestone 5 -> 6 event contract.
 *
 * Milestone 5 publishes these; Milestone 6 consumes them. The payload types
 * are the contract, so a change here is a breaking change for the consumer
 * and must be made deliberately.
 *
 * Two rules govern every payload:
 *
 * 1. **Authorized information only.** A payload carries the ids and the
 *    minimum display fields the recipient already has access to. It never
 *    carries an email address, a coordinate, a password hash, or anything a
 *    blocked or unrelated member could see.
 * 2. **Actor is explicit.** `actorId` is who caused the event, so the
 *    consumer can suppress self-notifications without guessing.
 */

/** Canonical event names. Stored in `DomainEventOutbox.type`. */
export const DOMAIN_EVENTS = {
  requestCreated: 'request.created',
  requestUpdated: 'request.updated',
  requestStatusChanged: 'request.status_changed',
  requestFulfilled: 'request.fulfilled',
  matchFound: 'match.found',
  offerReceived: 'offer.received',
  offerUpdated: 'offer.updated',
  offerAccepted: 'offer.accepted',
  offerRejected: 'offer.rejected',
  transactionStatusChanged: 'transaction.status_changed',
  // Milestone 7 borrowing.
  borrowRequested: 'borrow.requested',
  borrowApproved: 'borrow.approved',
  borrowDeclined: 'borrow.declined',
  borrowCancelled: 'borrow.cancelled',
  borrowPickupScheduled: 'borrow.pickup_scheduled',
  borrowHandoffConfirmed: 'borrow.handoff_confirmed',
  borrowReturnRequested: 'borrow.return_requested',
  borrowReturned: 'borrow.returned',
  borrowCompleted: 'borrow.completed',
  borrowOverdue: 'borrow.overdue',
  borrowExtensionRequested: 'borrow.extension_requested',
  borrowExtensionDecided: 'borrow.extension_decided',
  borrowDisputeOpened: 'borrow.dispute_opened',
  borrowDisputeUpdated: 'borrow.dispute_updated',
  // Milestone 9 neighborhood missions.
  missionPublished: 'mission.published',
  missionUpdated: 'mission.updated',
  missionCancelled: 'mission.cancelled',
  missionCompleted: 'mission.completed',
  missionJoined: 'mission.joined',
  missionParticipantApproved: 'mission.participant_approved',
  missionWaitlistPromoted: 'mission.waitlist_promoted',
  missionReminder: 'mission.reminder',
  missionAttendanceConfirmed: 'mission.attendance_confirmed',
  missionParticipationVerified: 'mission.participation_verified',
  communityBadgeEarned: 'community.badge_earned',
  communityModerationChanged: 'community.moderation_changed'
} as const

export type DomainEventType = (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS]

export interface EventEnvelope<T> {
  /** Unique id of the outbox row, so a consumer can dedupe on it. */
  id: string
  type: DomainEventType
  occurredAt: string
  /** The member who caused the event, when there is one. */
  actorId?: string
  payload: T
}

/** Who should receive the event. One recipient per event keeps it simple. */
export interface EventTarget {
  userId: string
}

export interface RequestCreatedPayload {
  requestId: string
  requesterId: string
  categoryId: string
  title: string
}

export interface RequestUpdatedPayload {
  requestId: string
  requesterId: string
}

export interface RequestStatusChangedPayload {
  requestId: string
  requesterId: string
  from: string
  to: string
}

export interface MatchFoundPayload {
  requestId: string
  requesterId: string
  listingId: string
  score: number
  reasons: string[]
}

export interface OfferReceivedPayload {
  offerId: string
  requestId: string
  requestTitle: string
  requesterId: string
  offererId: string
  amountCents: number | null
}

export interface OfferUpdatedPayload {
  offerId: string
  requestId: string
  requesterId: string
  offererId: string
  status: string
}

export interface OfferAcceptedPayload {
  offerId: string
  requestId: string
  requesterId: string
  offererId: string
  transactionId: string
  conversationId: string
}

export interface OfferRejectedPayload {
  offerId: string
  requestId: string
  requesterId: string
  offererId: string
}

/**
 * Borrowing payloads.
 *
 * Two invariants apply to every one of them. First, only ids and fields the
 * recipient already has access to: a pickup location note lives on the
 * handoff, never in an event, because an event is addressed by recipient
 * rather than by a page they chose to open. Second, `actorId` is explicit,
 * so a consumer never has to guess whether to suppress a self-notification.
 */
export interface BorrowRequestedPayload {
  borrowRequestId: string
  listingId: string
  listingTitle: string
  lenderId: string
  borrowerId: string
  startAt: string
  endAt: string
}

export interface BorrowDecisionPayload {
  borrowRequestId: string
  listingId: string
  lenderId: string
  borrowerId: string
  from: string
  to: string
}

export interface BorrowPickupScheduledPayload {
  borrowRequestId: string
  listingId: string
  lenderId: string
  borrowerId: string
  /** When the handoff is expected. The location note is deliberately absent. */
  scheduledAt: string
}

export interface BorrowHandoffConfirmedPayload {
  borrowRequestId: string
  listingId: string
  lenderId: string
  borrowerId: string
  kind: string
}

export interface BorrowOverduePayload {
  borrowRequestId: string
  listingId: string
  lenderId: string
  borrowerId: string
  endAt: string
  daysOverdue: number
}

export interface BorrowExtensionPayload {
  borrowRequestId: string
  listingId: string
  lenderId: string
  borrowerId: string
  extensionId: string
  status: string
  requestedEndAt: string
}

export interface BorrowDisputePayload {
  borrowRequestId: string
  listingId: string
  lenderId: string
  borrowerId: string
  disputeId: string
  reason: string
  status: string
}

export interface TransactionStatusChangedPayload {
  transactionId: string
  from: string
  to: string
  participantIds: string[]
}

/**
 * Milestone 9 mission events.
 *
 * `participantId` is included when one person is the subject of the event, so a
 * notification can be addressed to that person alone rather than to everyone on
 * the mission. No location, meeting point, or other participant detail is ever
 * placed in an event payload: events are read by the notification worker,
 * which is not the same trust boundary as the mission itself.
 */
export interface MissionPayload {
  missionId: string
  missionTitle: string
  organizerId: string
  /** Present only when one person is the subject of the event. */
  participantId?: string
  /** Everyone holding a confirmed slot, for organizer-to-all announcements. */
  participantIds?: string[]
  /** Neutral status context, e.g. 'PUBLISHED' or 'CANCELLED'. */
  to?: string
  /** Why, in a phrase safe to show a recipient. */
  reason?: string
}

export interface BadgeEarnedPayload {
  userId: string
  code: string
  label: string
}

/** Maps an event type to its payload shape, for compile-time safety. */
export interface DomainEventPayloads {
  'request.created': RequestCreatedPayload
  'request.updated': RequestUpdatedPayload
  'request.status_changed': RequestStatusChangedPayload
  'request.fulfilled': RequestStatusChangedPayload
  'match.found': MatchFoundPayload
  'offer.received': OfferReceivedPayload
  'offer.updated': OfferUpdatedPayload
  'offer.accepted': OfferAcceptedPayload
  'offer.rejected': OfferRejectedPayload
  'transaction.status_changed': TransactionStatusChangedPayload
  'borrow.requested': BorrowRequestedPayload
  'borrow.approved': BorrowDecisionPayload
  'borrow.declined': BorrowDecisionPayload
  'borrow.cancelled': BorrowDecisionPayload
  'borrow.pickup_scheduled': BorrowPickupScheduledPayload
  'borrow.handoff_confirmed': BorrowHandoffConfirmedPayload
  'borrow.return_requested': BorrowDecisionPayload
  'borrow.returned': BorrowHandoffConfirmedPayload
  'borrow.completed': BorrowDecisionPayload
  'borrow.overdue': BorrowOverduePayload
  'borrow.extension_requested': BorrowExtensionPayload
  'borrow.extension_decided': BorrowExtensionPayload
  'borrow.dispute_opened': BorrowDisputePayload
  'borrow.dispute_updated': BorrowDisputePayload
  'mission.published': MissionPayload
  'mission.updated': MissionPayload
  'mission.cancelled': MissionPayload
  'mission.completed': MissionPayload
  'mission.joined': MissionPayload
  'mission.participant_approved': MissionPayload
  'mission.waitlist_promoted': MissionPayload
  'mission.reminder': MissionPayload
  'mission.attendance_confirmed': MissionPayload
  'mission.participation_verified': MissionPayload
  'community.badge_earned': BadgeEarnedPayload
  'community.moderation_changed': MissionPayload
}

/**
 * Builds a stable dedupe key. The unique index on the column is what makes
 * redelivery idempotent, so this must be derived only from facts that
 * cannot legitimately repeat.
 */
export function dedupeKey(type: DomainEventType, ...parts: string[]): string {
  return `${type}:${parts.join(':')}`
}
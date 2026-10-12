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
  transactionStatusChanged: 'transaction.status_changed'
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

export interface TransactionStatusChangedPayload {
  transactionId: string
  from: string
  to: string
  participantIds: string[]
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
}

/**
 * Builds a stable dedupe key. The unique index on the column is what makes
 * redelivery idempotent, so this must be derived only from facts that
 * cannot legitimately repeat.
 */
export function dedupeKey(type: DomainEventType, ...parts: string[]): string {
  return `${type}:${parts.join(':')}`
}
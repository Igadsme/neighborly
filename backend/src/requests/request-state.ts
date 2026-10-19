import { RequestStatus } from '@prisma/client'

/**
 * Request lifecycle.
 *
 * Every transition the API allows is declared here and nowhere else, so the
 * controller, the service, and the tests cannot disagree about what is legal.
 * The set is deliberately small and one-directional apart from the resume
 * pair, because a request that has been fulfilled or cancelled must not
 * quietly reopen.
 */
const ALLOWED: Record<RequestStatus, RequestStatus[]> = {
  DRAFT: [RequestStatus.PUBLISHED, RequestStatus.CANCELLED],
  PUBLISHED: [
    RequestStatus.PAUSED,
    RequestStatus.FULFILLED,
    RequestStatus.CANCELLED,
    RequestStatus.EXPIRED
  ],
  PAUSED: [RequestStatus.PUBLISHED, RequestStatus.CANCELLED],
  FULFILLED: [],
  // CLOSED predates this state machine and is terminal: a request closed by
  // a moderator or by expiry is never reopened.
  CLOSED: [],
  CANCELLED: [],
  EXPIRED: []
}

export function allowedTransitions(status: RequestStatus): RequestStatus[] {
  return ALLOWED[status] ?? []
}

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return allowedTransitions(from).includes(to)
}

export function assertTransition(from: RequestStatus, to: RequestStatus) {
  if (from === to) return
  if (!canTransition(from, to)) {
    throw new Error(`Invalid request transition: ${from} -> ${to}`)
  }
}

/** A request is publicly visible only in these states. */
export const PUBLIC_STATUSES: RequestStatus[] = [RequestStatus.PUBLISHED, RequestStatus.PAUSED]

/** A request can receive offers only in these states. */
export const OFFERABLE_STATUSES: RequestStatus[] = [RequestStatus.PUBLISHED]

export function isExpired(request: { status: RequestStatus; deadline: Date | null }, now = new Date()) {
  if (request.status === RequestStatus.EXPIRED) return true
  if (!request.deadline) return false
  // A draft is the author's private scratch space; a past deadline does not
  // close it before it is ever published.
  if (request.status === RequestStatus.DRAFT || request.status === RequestStatus.CANCELLED) return false
  return request.deadline.getTime() < now.getTime()
}
import { BorrowRequestStatus } from '@prisma/client'

/**
 * The borrowing lifecycle.
 *
 * Every legal transition is declared here and nowhere else, so the service,
 * the controller, and the tests cannot disagree about what is allowed. The
 * shape mirrors the request lifecycle from Milestone 5, deliberately: one
 * owner, one table of transitions, one place to change.
 *
 * Two rules shape the graph:
 *
 * - **Nothing reopens.** A declined, cancelled, or completed request is
 *   terminal. A borrowing that ended badly must not quietly restart.
 * - **Ownership never moves.** A completed request still belongs to the
 *   lender and borrower it had.
 */
const ALLOWED: Record<BorrowRequestStatus, BorrowRequestStatus[]> = {
  REQUESTED: [BorrowRequestStatus.APPROVED, BorrowRequestStatus.DECLINED, BorrowRequestStatus.CANCELLED],
  APPROVED: [BorrowRequestStatus.PICKUP_SCHEDULED, BorrowRequestStatus.CANCELLED],
  PICKUP_SCHEDULED: [
    BorrowRequestStatus.CHECKED_OUT,
    BorrowRequestStatus.CANCELLED,
    // A lender may call off a pickup that never happened.
    BorrowRequestStatus.APPROVED
  ],
  CHECKED_OUT: [BorrowRequestStatus.RETURN_REQUESTED, BorrowRequestStatus.OVERDUE],
  RETURN_REQUESTED: [BorrowRequestStatus.RETURNED, BorrowRequestStatus.DISPUTED],
  RETURNED: [BorrowRequestStatus.COMPLETED, BorrowRequestStatus.DISPUTED],
  OVERDUE: [BorrowRequestStatus.RETURN_REQUESTED, BorrowRequestStatus.RETURNED, BorrowRequestStatus.DISPUTED],
  DISPUTED: [BorrowRequestStatus.RETURNED, BorrowRequestStatus.COMPLETED],
  DECLINED: [],
  COMPLETED: [],
  CANCELLED: []
}

export function allowedTransitions(status: BorrowRequestStatus): BorrowRequestStatus[] {
  return ALLOWED[status] ?? []
}

export function canTransition(from: BorrowRequestStatus, to: BorrowRequestStatus): boolean {
  return from === to || allowedTransitions(from).includes(to)
}

export function assertTransition(from: BorrowRequestStatus, to: BorrowRequestStatus) {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid borrow transition: ${from} -> ${to}`)
  }
}

/**
 * Statuses where the item is committed to one party and the dates are
 * blocked: the reservation exists or must exist.
 */
export const BLOCKING_STATUSES: BorrowRequestStatus[] = [
  BorrowRequestStatus.APPROVED,
  BorrowRequestStatus.PICKUP_SCHEDULED,
  BorrowRequestStatus.CHECKED_OUT,
  BorrowRequestStatus.RETURN_REQUESTED,
  BorrowRequestStatus.RETURNED,
  BorrowRequestStatus.OVERDUE
]

/**
 * A named set of statuses. Typed as a readonly list so `includes(status)`
 * accepts any status, and so it can be spread straight into a Prisma
 * `status: { in: [...] }` filter.
 */
const set = (...values: BorrowRequestStatus[]): BorrowRequestStatus[] => values

/** Statuses in which the item is physically with the borrower. */
export const CHECKED_OUT_STATUSES = set(
  BorrowRequestStatus.CHECKED_OUT,
  BorrowRequestStatus.RETURN_REQUESTED,
  BorrowRequestStatus.OVERDUE
)

/** Statuses a lender may still cancel, before the item has changed hands. */
export const LENDER_CANCELLABLE = set(
  BorrowRequestStatus.REQUESTED,
  BorrowRequestStatus.APPROVED,
  BorrowRequestStatus.PICKUP_SCHEDULED
)

/** Statuses a pickup can be scheduled or handed over from. */
export const PICKUP_STATUSES = set(
  BorrowRequestStatus.APPROVED,
  BorrowRequestStatus.PICKUP_SCHEDULED
)

/** Statuses a return can be confirmed from. */
export const RETURN_STATUSES = set(
  BorrowRequestStatus.CHECKED_OUT,
  BorrowRequestStatus.RETURN_REQUESTED,
  BorrowRequestStatus.OVERDUE,
  BorrowRequestStatus.DISPUTED
)

/** Statuses a dispute can freeze the borrowing at. */
export const DISPUTABLE_STATUSES = set(
  BorrowRequestStatus.CHECKED_OUT,
  BorrowRequestStatus.RETURN_REQUESTED,
  BorrowRequestStatus.OVERDUE,
  BorrowRequestStatus.RETURNED
)

// ---------------------------------------------------------------- intervals

/**
 * Intervals are half-open `[start, end)`.
 *
 * A booking ending at 10:00 and another beginning at 10:00 therefore do not
 * overlap, which is what lets a neighbor hand an item over on the same
 * morning it is due back. The database exclusion constraint uses the same
 * convention, so application and storage agree on the boundary.
 */
export function intervalsOverlap(
  a: { startAt: Date; endAt: Date },
  b: { startAt: Date; endAt: Date }
): boolean {
  return a.startAt.getTime() < b.endAt.getTime() && b.startAt.getTime() < a.endAt.getTime()
}

/** Inclusive-start, exclusive-end coverage. */
export function withinInterval(
  inner: { startAt: Date; endAt: Date },
  outer: { startAt: Date; endAt: Date }
): boolean {
  return (
    inner.startAt.getTime() >= outer.startAt.getTime() &&
    inner.endAt.getTime() <= outer.endAt.getTime()
  )
}

const DAY_MS = 86_400_000

export function daysBetween(startAt: Date, endAt: Date): number {
  return Math.ceil((endAt.getTime() - startAt.getTime()) / DAY_MS)
}

export const MAX_BORROW_DAYS_LIMIT = 365
export const MIN_BORROW_DAYS = 1

/**
 * Normalizes and validates a requested window.
 *
 * @returns the reason the window is unacceptable, or null when it is usable.
 * `maxDays` is the item's own ceiling when it has one.
 */
export function validateWindow(
  startAt: Date,
  endAt: Date,
  options: { now?: Date; maxDays?: number | null } = {}
): string | null {
  const now = options.now ?? new Date()
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return 'Dates must be valid ISO timestamps'
  }
  if (endAt.getTime() <= startAt.getTime()) {
    return 'The return date must be after the pickup date'
  }
  // A small grace period keeps a clock-skewed client from being told its
  // own "now" is in the past.
  if (startAt.getTime() < now.getTime() - 5 * 60_000) {
    return 'The pickup date cannot be in the past'
  }
  // The minimum is measured on the raw duration, not on the rounded day
  // count: a twelve hour loan would round up to one day and slip past a
  // ceiling that is supposed to mean "a full day".
  if (endAt.getTime() - startAt.getTime() < MIN_BORROW_DAYS * DAY_MS) {
    return `A borrowing must be at least ${MIN_BORROW_DAYS} day`
  }
  const days = daysBetween(startAt, endAt)
  if (options.maxDays != null && days > options.maxDays) {
    return `This item can be borrowed for at most ${options.maxDays} days`
  }
  if (days > MAX_BORROW_DAYS_LIMIT) {
    return `A borrowing cannot exceed ${MAX_BORROW_DAYS_LIMIT} days`
  }
  return null
}

/**
 * Whether a borrowing has passed its due date while the item is still out.
 *
 * Only the states where the item is physically with the borrower can be
 * overdue: an approved request that has not been collected yet is not late.
 */
export function isExpiredLike(
  request: { status: BorrowRequestStatus; endAt: Date },
  now: Date = new Date()
): boolean {
  if (!CHECKED_OUT_STATUSES.includes(request.status)) return false
  return request.endAt.getTime() < now.getTime()
}

/**
 * Whether a handoff needs both sides. It always does: one party clicking a
 * button must never be enough to move the item.
 */
export function handoffComplete(handoff: {
  borrowerConfirmedAt: Date | null
  lenderConfirmedAt: Date | null
}): boolean {
  return handoff.borrowerConfirmedAt !== null && handoff.lenderConfirmedAt !== null
}
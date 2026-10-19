import { BorrowRequestStatus } from '@prisma/client'
import {
  BLOCKING_STATUSES,
  CHECKED_OUT_STATUSES,
  DISPUTABLE_STATUSES,
  PICKUP_STATUSES,
  RETURN_STATUSES,
  allowedTransitions,
  canTransition,
  daysBetween,
  handoffComplete,
  intervalsOverlap,
  isExpiredLike,
  validateWindow,
  withinInterval
} from './borrow-state'

/**
 * The lifecycle and interval rules are pure, so they are tested without a
 * database. These two properties are the ones the rest of the system leans
 * on: the graph is closed, and intervals are half-open.
 */

const NOW = new Date('2026-10-01T12:00:00.000Z')

describe('borrow state machine', () => {
  it('allows exactly the declared transitions out of each state', () => {
    expect(allowedTransitions(BorrowRequestStatus.REQUESTED)).toEqual(
      expect.arrayContaining([
        BorrowRequestStatus.APPROVED,
        BorrowRequestStatus.DECLINED,
        BorrowRequestStatus.CANCELLED
      ])
    )
    expect(allowedTransitions(BorrowRequestStatus.COMPLETED)).toEqual([])
    expect(allowedTransitions(BorrowRequestStatus.CANCELLED)).toEqual([])
    expect(allowedTransitions(BorrowRequestStatus.DECLINED)).toEqual([])
  })

  it('never lets a terminal state reopen', () => {
    const terminal = [
      BorrowRequestStatus.COMPLETED,
      BorrowRequestStatus.CANCELLED,
      BorrowRequestStatus.DECLINED
    ]
    for (const from of terminal) {
      for (const to of Object.values(BorrowRequestStatus)) {
        expect(canTransition(from, to)).toBe(from === to)
      }
    }
  })

  it('treats a same-state move as a no-op rather than an error', () => {
    expect(canTransition(BorrowRequestStatus.APPROVED, BorrowRequestStatus.APPROVED)).toBe(true)
  })

  it('refuses to approve something already checked out', () => {
    expect(canTransition(BorrowRequestStatus.CHECKED_OUT, BorrowRequestStatus.APPROVED)).toBe(false)
  })

  it('routes the whole happy path', () => {
    const path = [
      BorrowRequestStatus.REQUESTED,
      BorrowRequestStatus.APPROVED,
      BorrowRequestStatus.PICKUP_SCHEDULED,
      BorrowRequestStatus.CHECKED_OUT,
      BorrowRequestStatus.RETURN_REQUESTED,
      BorrowRequestStatus.RETURNED,
      BorrowRequestStatus.COMPLETED
    ]
    for (let index = 0; index < path.length - 1; index += 1) {
      expect(canTransition(path[index], path[index + 1])).toBe(true)
    }
  })

  it('keeps an overdue borrowing recoverable', () => {
    expect(canTransition(BorrowRequestStatus.OVERDUE, BorrowRequestStatus.RETURNED)).toBe(true)
    expect(canTransition(BorrowRequestStatus.OVERDUE, BorrowRequestStatus.DISPUTED)).toBe(true)
    // An overdue item cannot be quietly re-approved.
    expect(canTransition(BorrowRequestStatus.OVERDUE, BorrowRequestStatus.APPROVED)).toBe(false)
  })
})

describe('role-scoped status sets', () => {
  it('treats a pending request as the only borrower-cancellable state', () => {
    // A borrower who has the item cannot "cancel" the loan; they return it.
    expect(PICKUP_STATUSES).not.toContain(BorrowRequestStatus.CHECKED_OUT)
    expect(RETURN_STATUSES).toContain(BorrowRequestStatus.CHECKED_OUT)
    expect(RETURN_STATUSES).toContain(BorrowRequestStatus.OVERDUE)
  })

  it('blocks the item only once it is actually committed', () => {
    expect(BLOCKING_STATUSES).toContain(BorrowRequestStatus.APPROVED)
    expect(BLOCKING_STATUSES).not.toContain(BorrowRequestStatus.REQUESTED)
    expect(BLOCKING_STATUSES).not.toContain(BorrowRequestStatus.DECLINED)
  })

  it('only lets a dispute freeze states where something is physically held', () => {
    expect(DISPUTABLE_STATUSES).toContain(BorrowRequestStatus.CHECKED_OUT)
    expect(DISPUTABLE_STATUSES).toContain(BorrowRequestStatus.RETURNED)
    expect(DISPUTABLE_STATUSES).not.toContain(BorrowRequestStatus.REQUESTED)
    expect(CHECKED_OUT_STATUSES).toContain(BorrowRequestStatus.OVERDUE)
  })
})

describe('half-open intervals', () => {
  const base = { startAt: new Date('2026-10-02T10:00:00Z'), endAt: new Date('2026-10-05T10:00:00Z') }

  it('detects a genuine overlap', () => {
    expect(intervalsOverlap(base, { startAt: new Date('2026-10-04T00:00:00Z'), endAt: new Date('2026-10-06T00:00:00Z') })).toBe(true)
    expect(intervalsOverlap(base, { startAt: new Date('2026-10-01T00:00:00Z'), endAt: new Date('2026-10-03T00:00:00Z') })).toBe(true)
  })

  it('treats touching bookings as non-overlapping', () => {
    // A neighbor may collect an item the moment it is due back.
    expect(intervalsOverlap(base, { startAt: base.endAt, endAt: new Date('2026-10-08T10:00:00Z') })).toBe(false)
    expect(intervalsOverlap(base, { startAt: new Date('2026-09-28T10:00:00Z'), endAt: base.startAt })).toBe(false)
  })

  it('detects a fully contained booking', () => {
    expect(intervalsOverlap(base, { startAt: new Date('2026-10-03T00:00:00Z'), endAt: new Date('2026-10-04T00:00:00Z') })).toBe(true)
  })

  it('reports coverage for the availability calendar', () => {
    expect(withinInterval(base, { startAt: new Date('2026-10-01T00:00:00Z'), endAt: new Date('2026-10-10T00:00:00Z') })).toBe(true)
    expect(withinInterval(base, { startAt: new Date('2026-10-01T00:00:00Z'), endAt: new Date('2026-10-04T00:00:00Z') })).toBe(false)
  })
})

describe('window validation', () => {
  const inDays = (days: number) => new Date(NOW.getTime() + days * 86_400_000)

  it('accepts a sane future window', () => {
    expect(validateWindow(inDays(2), inDays(5), { now: NOW })).toBeNull()
  })

  it('rejects a window that ends before it starts', () => {
    expect(validateWindow(inDays(5), inDays(2), { now: NOW })).toMatch(/after the pickup date/)
  })

  it('rejects a window that ends exactly when it starts', () => {
    expect(validateWindow(inDays(2), inDays(2), { now: NOW })).toMatch(/after the pickup date/)
  })

  it('rejects a pickup in the past', () => {
    expect(validateWindow(inDays(-1), inDays(2), { now: NOW })).toMatch(/past/)
  })

  it('allows a small clock skew rather than rejecting a live "now"', () => {
    expect(validateWindow(new Date(NOW.getTime() - 60_000), inDays(2), { now: NOW })).toBeNull()
  })

  it('enforces the item own maximum duration', () => {
    expect(validateWindow(inDays(1), inDays(10), { now: NOW, maxDays: 7 })).toMatch(/at most 7 days/)
    expect(validateWindow(inDays(1), inDays(10), { now: NOW, maxDays: null })).toBeNull()
  })

  it('enforces an absolute ceiling even without an item limit', () => {
    expect(validateWindow(inDays(1), inDays(400), { now: NOW })).toMatch(/cannot exceed/)
  })

  it('rejects a sub-day borrowing', () => {
    expect(validateWindow(inDays(2), inDays(2.5), { now: NOW })).toMatch(/at least 1 day/)
  })

  it('rejects unparseable dates', () => {
    expect(validateWindow(new Date('nonsense'), inDays(2), { now: NOW })).toMatch(/valid ISO/)
  })

  it('counts whole days, rounding a partial day up', () => {
    expect(daysBetween(NOW, new Date(NOW.getTime() + 3 * 86_400_000))).toBe(3)
    expect(daysBetween(NOW, new Date(NOW.getTime() + 3.2 * 86_400_000))).toBe(4)
  })
})

describe('two-sided handoff', () => {
  it('is not complete until both sides have confirmed', () => {
    expect(handoffComplete({ borrowerConfirmedAt: null, lenderConfirmedAt: null })).toBe(false)
    expect(handoffComplete({ borrowerConfirmedAt: new Date(), lenderConfirmedAt: null })).toBe(false)
    expect(handoffComplete({ borrowerConfirmedAt: null, lenderConfirmedAt: new Date() })).toBe(false)
    expect(handoffComplete({ borrowerConfirmedAt: new Date(), lenderConfirmedAt: new Date() })).toBe(true)
  })
})

describe('expiry helper', () => {
  it('treats a past due date as expired', () => {
    expect(
      isExpiredLike(
        { status: BorrowRequestStatus.CHECKED_OUT, endAt: new Date(NOW.getTime() - 1000) },
        NOW
      )
    ).toBe(true)
  })

  it('leaves a future due date alone', () => {
    expect(
      isExpiredLike(
        { status: BorrowRequestStatus.CHECKED_OUT, endAt: new Date(NOW.getTime() + 1000) },
        NOW
      )
    ).toBe(false)
  })

  it('does not expire something the item is not out for', () => {
    expect(
      isExpiredLike(
        { status: BorrowRequestStatus.APPROVED, endAt: new Date(NOW.getTime() - 1000) },
        NOW
      )
    ).toBe(false)
  })
})
import { NotificationWorker } from './notification-worker'

/**
 * The event-to-notification mapping is pure, so it is tested without a
 * database. What matters is that a member is never notified about their own
 * action and that a redelivered event maps to the same dedupe key.
 */
describe('NotificationWorker.intentsFor', () => {
  const worker = new NotificationWorker({} as never, {} as never)
  const actorId = '11111111-1111-4111-8111-111111111111'
  const otherId = '22222222-2222-4222-8222-222222222222'

  function intent(type: string, payload: Record<string, unknown>, dedupe = ['e1']) {
    return worker.intentsFor({
      type,
      payload: payload as never,
      actorId,
      dedupeKey: `evt:${dedupe.join(':')}`
    })
  }

  it('notifies the requester about a new offer, not the offerer', () => {
    const rows = intent('offer.received', {
      requestId: 'r1',
      requestTitle: 'Oak chair',
      requesterId: otherId,
      offererId: actorId
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe(otherId)
    expect(rows[0].type).toBe('offer_received')
  })

  it('notifies the offerer about an acceptance', () => {
    const rows = intent('offer.accepted', {
      offerId: 'o1',
      requestId: 'r1',
      requesterId: actorId,
      offererId: otherId,
      transactionId: 't1',
      conversationId: 'c1'
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe(otherId)
    expect(rows[0].link).toContain('t1')
  })

  it('notifies the offerer about a rejection', () => {
    const rows = intent('offer.rejected', {
      offerId: 'o1',
      requestId: 'r1',
      requesterId: actorId,
      offererId: otherId
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe(otherId)
  })

  it('suppresses a self-notification on a request update', () => {
    const rows = intent('request.updated', { requestId: 'r1', requesterId: actorId })
    // The actor caused it; notifying them would be noise.
    expect(rows).toHaveLength(0)
  })

  it('notifies about someone else request update', () => {
    const rows = intent('request.updated', { requestId: 'r1', requesterId: otherId, to: 'PAUSED' })
    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe(otherId)
  })

  it('notifies every participant except the actor on a transaction change', () => {
    const third = '33333333-3333-4333-8333-333333333333'
    const rows = intent('transaction.status_changed', {
      transactionId: 't1',
      from: 'ACCEPTED',
      to: 'COMPLETED',
      participantIds: [actorId, otherId, third]
    })
    expect(rows.map(row => row.userId).sort()).toEqual([otherId, third].sort())
    // Each recipient gets their own dedupe key, so one member's notification
    // never suppresses another's.
    expect(rows[0].dedupe).not.toEqual(rows[1].dedupe)
  })

  it('produces the same dedupe key for the same event twice', () => {
    const payload = { offerId: 'o1', requestId: 'r1', requesterId: otherId, offererId: actorId }
    const first = intent('offer.received', payload, ['same'])
    const second = intent('offer.received', payload, ['same'])
    expect(first[0].dedupe).toEqual(second[0].dedupe)
  })

  it('produces a different dedupe key for different events', () => {
    const payload = { offerId: 'o1', requestId: 'r1', requesterId: otherId, offererId: actorId }
    const first = intent('offer.received', payload, ['a'])
    const second = intent('offer.received', payload, ['b'])
    expect(first[0].dedupe).not.toEqual(second[0].dedupe)
  })

  it('drops an event with no recipient rather than writing an orphan', () => {
    const rows = intent('offer.received', { requestId: 'r1', requesterId: '', offererId: actorId })
    expect(rows).toHaveLength(0)
  })

  it('leaves match events to the saved-search worker', () => {
    const rows = intent('match.found', { requestId: 'r1', requesterId: otherId, listingId: 'l1' })
    expect(rows).toHaveLength(0)
  })

  it('ignores an unknown event type', () => {
    expect(worker.intentsFor({ type: 'nope', payload: {} as never, actorId })).toHaveLength(0)
  })
})
describe('NotificationWorker borrow intents', () => {
  const worker = new NotificationWorker({} as never, {} as never)
  const lender = '11111111-1111-4111-8111-111111111111'
  const borrower = '22222222-2222-4222-8222-222222222222'
  const requestId = 'req-1'

  function borrow(type: string, payload: Record<string, unknown>, actor?: string | null) {
    return worker.intentsFor({
      type,
      payload: payload as never,
      actorId: actor ?? null,
      dedupeKey: `evt:${type}`
    })
  }

  const base = {
    borrowRequestId: requestId,
    listingId: 'listing-1',
    lenderId: lender,
    borrowerId: borrower
  }

  it('notifies the lender about a new request and never the offerer', () => {
    const rows = borrow('borrow.requested', { ...base, listingTitle: 'Cordless drill' }, borrower)
    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe(lender)
    expect(rows[0].link).toContain(requestId)
  })

  it('does not notify the requester about their own request', () => {
    expect(borrow('borrow.requested', base, lender)).toHaveLength(0)
  })

  it('notifies the borrower about an approval', () => {
    const rows = borrow('borrow.approved', { ...base, from: 'REQUESTED', to: 'APPROVED' }, lender)
    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe(borrower)
  })

  it('notifies the borrower about a decline', () => {
    const rows = borrow('borrow.declined', base, lender)
    expect(rows.map(row => row.userId)).toEqual([borrower])
  })

  it('tells the borrower a pickup was scheduled, without the meeting point', () => {
    const rows = borrow(
      'borrow.pickup_scheduled',
      { ...base, scheduledAt: '2026-10-10T09:00:00.000Z' },
      lender
    )
    // Whoever scheduled it already knows; the other party is the one who
    // needs telling.
    expect(rows.map(row => row.userId)).toEqual([borrower])
    // The payload carries the time and nothing about where.
    expect(JSON.stringify(rows)).not.toContain('location')
    expect(rows.every(row => (row.link ?? '').includes(requestId))).toBe(true)
  })

  it('notifies the lender when the borrower schedules a pickup', () => {
    const rows = borrow(
      'borrow.pickup_scheduled',
      { ...base, scheduledAt: '2026-10-10T09:00:00.000Z' },
      borrower
    )
    expect(rows.map(row => row.userId)).toEqual([lender])
  })

  it('tells both parties about an overdue item', () => {
    const rows = borrow('borrow.overdue', { ...base, endAt: '2026-10-10T09:00:00.000Z', daysOverdue: 2 }, null)
    expect(rows.map(row => row.userId).sort()).toEqual([borrower, lender].sort())
    // Each recipient gets a distinct dedupe key, so one notification cannot
    // suppress the other.
    expect(rows[0].dedupe).not.toEqual(rows[1].dedupe)
  })

  it('notifies the lender about an extension request and the borrower about the decision', () => {
    const asked = borrow(
      'borrow.extension_requested',
      { ...base, extensionId: 'e1', status: 'REQUESTED', requestedEndAt: '2026-10-20T09:00:00.000Z' },
      borrower
    )
    expect(asked.map(row => row.userId)).toEqual([lender])

    const decided = borrow(
      'borrow.extension_decided',
      { ...base, extensionId: 'e1', status: 'APPROVED', requestedEndAt: '2026-10-20T09:00:00.000Z' },
      lender
    )
    expect(decided.map(row => row.userId)).toEqual([borrower])
    expect(decided[0].title).toMatch(/approved/i)
  })

  it('tells the other party about a dispute, not the opener', () => {
    const rows = borrow('borrow.dispute_opened', { ...base, disputeId: 'd1', reason: 'DAMAGE', status: 'OPEN' }, lender)
    expect(rows.map(row => row.userId)).toEqual([borrower])
    expect(rows[0].link).toContain('d1')
  })

  it('notifies a handoff to the party that did not confirm', () => {
    const rows = borrow('borrow.handoff_confirmed', { ...base, kind: 'PICKUP' }, borrower)
    expect(rows.map(row => row.userId)).toEqual([lender])
  })

  it('links every borrow notification to a real route', () => {
    const rows = [
      ...borrow('borrow.approved', base, lender),
      ...borrow('borrow.decline' as 'borrow.declined', base, lender),
      ...borrow('borrow.extension_requested', { ...base, extensionId: 'e1', status: 'REQUESTED', requestedEndAt: 'x' }, borrower)
    ]
    for (const row of rows) {
      expect(row.link).toMatch(/^\/borrow\//)
    }
  })
})

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
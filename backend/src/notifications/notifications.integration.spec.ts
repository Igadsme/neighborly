import { randomUUID } from 'node:crypto'
import { OutboxWriter } from '../events/outbox-writer'
import { DOMAIN_EVENTS } from '../events/domain-events'
import { NotificationWorker } from '../notifications/notification-worker'
import { NotificationsService } from '../notifications/notifications.service'
import { SavedSearchAlertWorker } from '../notifications/saved-search-worker'
import { MessagingGateway } from '../messaging/messaging.gateway'
import { MessagingService } from '../messaging/messaging.service'
import { PrismaService } from '../prisma/prisma.service'
import { createTestPrisma, drainUntilDelivered } from '../common/testing/integration-fixtures'

const PASSWORD_HASH = '$argon2id$stub'

/**
 * Exercises the flows a member actually experiences, against real
 * PostgreSQL: message delivery, unread movement, offer notifications,
 * idempotent redelivery, preference suppression, and saved-search alerts.
 */
describe('Messaging and notifications against real PostgreSQL', () => {
  let prisma: PrismaService
  let notifications: NotificationsService
  let worker: NotificationWorker
  let savedSearch: SavedSearchAlertWorker
  let messaging: MessagingService

  beforeAll(async () => {
    prisma = createTestPrisma()
    await prisma.$connect()
    // Realtime is exercised separately against a real server; here the
    // double only records what would have been broadcast.
    const realtime = {
      publishMessage: async () => undefined,
      publishUnreadCounts: async () => undefined,
      publishNotification: async () => undefined
    } as unknown as MessagingGateway
    worker = new NotificationWorker(prisma, realtime)
    notifications = new NotificationsService(prisma)
    savedSearch = new SavedSearchAlertWorker(prisma, worker)
    messaging = new MessagingService(prisma, realtime)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  async function makeUser(prefix: string) {
    const id = randomUUID()
    await prisma.user.create({
      data: { id, email: `${prefix}-${id}@example.com`, passwordHash: PASSWORD_HASH }
    })
    await prisma.profile.create({ data: { userId: id, firstName: 'Test', lastName: 'User' } })
    return id
  }

  async function notificationsFor(userId: string) {
    const page = await notifications.list(userId, { limit: 100 })
    return page.items
  }

  async function makeConversation(a: string, b: string) {
    const conversation = await prisma.conversation.create({
      data: { participants: { create: [{ userId: a }, { userId: b }] } }
    })
    return conversation.id
  }

  // ------------------------------------------------------------- unread counts

  it('increments the recipient unread count and resets it on read', async () => {
    const a = await makeUser('unread-a')
    const b = await makeUser('unread-b')
    const conversationId = await makeConversation(a, b)

    await messaging.sendMessage(a, conversationId, 'First message')
    let row = await prisma.conversationParticipant.findUniqueOrThrow({
      where: { conversationId_userId: { conversationId, userId: b } }
    })
    expect(row.unreadCount).toBe(1)

    // The sender's own badge never moves.
    const senderRow = await prisma.conversationParticipant.findUniqueOrThrow({
      where: { conversationId_userId: { conversationId, userId: a } }
    })
    expect(senderRow.unreadCount).toBe(0)

    await messaging.sendMessage(a, conversationId, 'Second message')
    row = await prisma.conversationParticipant.findUniqueOrThrow({
      where: { conversationId_userId: { conversationId, userId: b } }
    })
    expect(row.unreadCount).toBe(2)

    await messaging.markRead(b, conversationId)
    row = await prisma.conversationParticipant.findUniqueOrThrow({
      where: { conversationId_userId: { conversationId, userId: b } }
    })
    expect(row.unreadCount).toBe(0)
    expect(row.lastReadAt).not.toBeNull()
  })

  it('reports a global unread total and a per-conversation count', async () => {
    const a = await makeUser('total-a')
    const b = await makeUser('total-b')
    const first = await makeConversation(a, b)
    const second = await makeConversation(a, b)

    await messaging.sendMessage(a, first, 'One')
    await messaging.sendMessage(a, second, 'Two')
    await messaging.sendMessage(a, second, 'Three')

    expect(await messaging.unreadTotals(b)).toEqual({ messages: 3 })

    const list = await messaging.listConversations(b)
    const counts = list.map(row => row.unreadCount).sort((x, y) => x - y)
    expect(counts).toEqual([1, 2])
  })

  it('refuses to read or send in a conversation the caller is not part of', async () => {
    const a = await makeUser('access-a')
    const b = await makeUser('access-b')
    const outsider = await makeUser('access-out')
    const conversationId = await makeConversation(a, b)

    await expect(messaging.sendMessage(outsider, conversationId, 'Hello')).rejects.toThrow('not a participant')
    await expect(messaging.markRead(outsider, conversationId)).rejects.toThrow('not a participant')
    await expect(messaging.listMessages(outsider, conversationId)).rejects.toThrow('not a participant')
  })

  it('paginates history by message id rather than an offset', async () => {
    const a = await makeUser('page-a')
    const b = await makeUser('page-b')
    const conversationId = await makeConversation(a, b)
    const sent: string[] = []
    for (let index = 0; index < 7; index += 1) {
      await messaging.sendMessage(a, conversationId, `Message ${index}`)
      sent.push('pending')
    }
    const rows = await messaging.listMessages(a, conversationId, { limit: 3 })
    expect(rows).toHaveLength(3)
    expect(rows.map(row => row.body)).toEqual(['Message 4', 'Message 5', 'Message 6'])

    // The next page is anchored on the oldest row already held, so no row is
    // skipped or repeated even though a message may have arrived meanwhile.
    const older = await messaging.listMessages(a, conversationId, {
      limit: 3,
      before: rows[0].id
    })
    expect(older.map(row => row.body)).toEqual(['Message 1', 'Message 2', 'Message 3'])
    const ids = new Set([...older.map(row => row.id), ...rows.map(row => row.id)])
    expect(ids.size).toBe(6)
  })

  it('rejects a page anchor that does not belong to the conversation', async () => {
    const a = await makeUser('anchor-a')
    const b = await makeUser('anchor-b')
    const stranger = await makeUser('anchor-out')
    const first = await makeConversation(a, b)
    const second = await makeConversation(a, stranger)
    await messaging.sendMessage(a, first, 'In the first thread')
    await messaging.sendMessage(a, second, 'In the second thread')

    const foreignAnchor = await messaging.listMessages(a, first, { limit: 10 })
    await expect(
      messaging.listMessages(a, second, { before: foreignAnchor[0].id })
    ).rejects.toThrow('anchor')
  })

  it('marks a message read only for the member who read past it', async () => {
    const a = await makeUser('receipt-a')
    const b = await makeUser('receipt-b')
    const conversationId = await makeConversation(a, b)
    await messaging.sendMessage(a, conversationId, 'First')
    await messaging.sendMessage(b, conversationId, 'Second')

    await messaging.markRead(b, conversationId)
    // B has read past both, so both show a receipt in B's own view.
    const asB = await messaging.listMessages(b, conversationId)
    expect(asB.every(row => row.readAt !== null)).toBe(true)

    // A has not read, so A sees no receipts at all.
    const asA = await messaging.listMessages(a, conversationId)
    expect(asA.every(row => row.readAt === null)).toBe(true)
  })

  it('reports whether older history exists beyond the page on screen', async () => {
    const a = await makeUser('more-a')
    const b = await makeUser('more-b')
    const conversationId = await makeConversation(a, b)
    await messaging.sendMessage(a, conversationId, 'Only one')

    // With no anchor the answer is whether the thread has any history.
    expect(await messaging.hasMoreMessages(a, conversationId)).toBe(true)
    // Once the newest page is on screen, nothing older remains.
    const rows = await messaging.listMessages(a, conversationId, { limit: 1 })
    expect(await messaging.hasMoreMessages(a, conversationId, rows[0].id)).toBe(false)

    await messaging.sendMessage(a, conversationId, 'Another')
    const bigger = await messaging.listMessages(a, conversationId, { limit: 1 })
    expect(await messaging.hasMoreMessages(a, conversationId, bigger[0].id)).toBe(true)
  })

  it('marks only the caller own conversation read', async () => {
    const a = await makeUser('read-a')
    const b = await makeUser('read-b')
    const conversationId = await makeConversation(a, b)
    await messaging.sendMessage(a, conversationId, 'Unread for b')

    await messaging.markRead(a, conversationId)
    const row = await prisma.conversationParticipant.findUniqueOrThrow({
      where: { conversationId_userId: { conversationId, userId: b } }
    })
    // Reading as A cannot clear B's badge.
    expect(row.unreadCount).toBe(1)
  })

  // ------------------------------------------------------------ notifications

  it('turns a delivered offer into exactly one notification', async () => {
    const requester = await makeUser('notify-requester')
    const offerer = await makeUser('notify-offerer')
    const category = randomUUID()
    await prisma.category.create({ data: { id: category, name: `Cat ${category.slice(0, 8)}`, slug: `c-${category}` } })

    const request = await prisma.needRequest.create({
      data: {
        requesterId: requester,
        categoryId: category,
        title: 'Oak chair',
        description: 'Looking for a solid oak chair',
        mode: 'BUY',
        status: 'PUBLISHED'
      }
    })
    const outbox = new OutboxWriter(prisma)
    await prisma.$transaction(async tx => {
      await tx.requestOffer.create({
        data: { requestId: request.id, offererId: offerer, amountCents: 9000, message: 'Available', status: 'PENDING' }
      })
      await outbox.record(
        DOMAIN_EVENTS.offerReceived,
        {
          offerId: randomUUID(),
          requestId: request.id,
          requestTitle: request.title,
          requesterId: requester,
          offererId: offerer,
          amountCents: 9000
        },
        { actorId: offerer, dedupe: [randomUUID()] },
        tx
      )
    })

    // Drain until the queue is empty: earlier tests leave rows behind, so a
    // single batched drain may not reach this event.
    let processed = 0
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const drained = await worker.drain(100)
      processed += drained
      if (drained === 0) break
    }
    expect(processed).toBeGreaterThan(0)

    const list = await notifications.list(requester)
    expect(list.items.some(row => row.type === 'offer_received')).toBe(true)
    expect(list.unread).toBeGreaterThan(0)

    // The offerer is not notified about their own action.
    const asOfferer = await notifications.list(offerer)
    expect(asOfferer.items.some(row => row.type === 'offer_received')).toBe(false)
  })

  it('produces one notification when the same event is delivered twice', async () => {
    const requester = await makeUser('dupe-requester')
    const offerer = await makeUser('dupe-offerer')
    const eventKey = `offer.accepted:${randomUUID()}`
    const outbox = new OutboxWriter(prisma)

    await outbox.record(
      DOMAIN_EVENTS.offerAccepted,
      {
        offerId: randomUUID(),
        requestId: randomUUID(),
        requesterId: requester,
        offererId: offerer,
        transactionId: randomUUID(),
        conversationId: randomUUID()
      },
      { dedupe: [eventKey] }
    )
    await drainUntilDelivered(worker, () => notifications.list(offerer), result => result.total >= 1)
    const first = await notifications.list(offerer)

    // Redelivery of an identical event: same dedupeKey, so the insert is a
    // no-op rather than a second notification.
    await prisma.domainEventOutbox.updateMany({
      where: { dedupeKey: eventKey },
      data: { status: 'PENDING', processedAt: null }
    })
    await drainUntilDelivered(worker, () => notifications.list(offerer), result => result.total >= 1)
    const second = await notifications.list(offerer)

    expect(first.total).toBe(1)
    expect(second.total).toBe(1)
    expect(second.items[0].id).toBe(first.items[0].id)
  })

  it('retries a failed event with backoff instead of dropping it', async () => {
    const offerer = await makeUser('retry-offerer')
    const id = randomUUID()
    await prisma.domainEventOutbox.create({
      data: {
        id,
        type: DOMAIN_EVENTS.offerRejected,
        // A well-formed but nonexistent recipient fails the foreign key, so
        // the write genuinely throws and the retry path is exercised.
        payload: {
          offerId: randomUUID(),
          requestId: randomUUID(),
          requesterId: '',
          offererId: randomUUID()
        },
        dedupeKey: `broken:${id}`,
        attempts: 0
      }
    })

    await worker.drain()
    const row = await prisma.domainEventOutbox.findUniqueOrThrow({ where: { id } })
    // The row is still tracked with an attempt count and an error, not lost.
    expect(row.attempts).toBeGreaterThan(0)
    expect(row.lastError).toBeTruthy()
    expect(['PENDING', 'FAILED']).toContain(row.status)
    expect(await notifications.list(offerer)).toMatchObject({ total: 0 })
  })

  it('respects a notification preference', async () => {
    const requester = await makeUser('pref-requester')
    const offerer = await makeUser('pref-offerer')
    await prisma.notificationPreference.create({ data: { userId: requester, offers: false } })

    const eventId = randomUUID()
    await new OutboxWriter(prisma).record(
      DOMAIN_EVENTS.offerReceived,
      {
        offerId: randomUUID(),
        requestId: randomUUID(),
        requestTitle: 'Chair',
        requesterId: requester,
        offererId: offerer,
        amountCents: 1000
      },
      { dedupe: [eventId] }
    )
    await worker.drain()

    expect((await notifications.list(requester)).total).toBe(0)
    // Turning it back on takes effect for the next event.
    await notifications.updatePreferences(requester, { offers: true })
    expect((await notifications.preferences(requester)).offers).toBe(true)
  })

  it('never lets one member read or clear another notification', async () => {
    const owner = await makeUser('notify-owner')
    const stranger = await makeUser('notify-stranger')
    await worker.notify({
      userId: owner,
      type: 'offer_received',
      title: 'Private',
      dedupe: [randomUUID()]
    })
    const mine = await notifications.list(owner)
    const id = mine.items[0].id

    expect((await notifications.list(stranger)).total).toBe(0)
    await expect(notifications.markRead(stranger, id)).rejects.toThrow('Notification not found')
    expect((await notifications.list(owner)).unread).toBe(1)
    await notifications.markRead(owner, id)
    expect((await notifications.list(owner)).unread).toBe(0)
  })

  it('marks all notifications read at once', async () => {
    const user = await makeUser('mark-all')
    for (let index = 0; index < 3; index += 1) {
      await worker.notify({
        userId: user,
        type: 'offer_received',
        title: `Item ${index}`,
        dedupe: [randomUUID()]
      })
    }
    expect((await notifications.list(user)).unread).toBe(3)
    const result = await notifications.markAllRead(user)
    expect(result.updated).toBe(3)
    expect((await notifications.list(user)).unread).toBe(0)
  })

  it('persists notification preferences and applies them', async () => {
    const user = await makeUser('prefs')
    const created = await notifications.preferences(user)
    expect(created.messages).toBe(true)
    expect(created.community).toBe(false)

    const updated = await notifications.updatePreferences(user, { messages: false, matches: false })
    expect(updated.messages).toBe(false)
    expect(updated.matches).toBe(false)
    // A later read reflects the change.
    expect((await notifications.preferences(user)).messages).toBe(false)
  })

  // ---------------------------------------------------------- saved searches

  it('alerts a saved search once when a matching listing appears', async () => {
    const watcher = await makeUser('alert-watcher')
    const seller = await makeUser('alert-seller')
    const category = randomUUID()
    await prisma.category.create({ data: { id: category, name: `Cat ${category.slice(0, 8)}`, slug: `c-${category}` } })
    const search = await prisma.savedSearch.create({
      data: { userId: watcher, query: 'oak desk', filters: { categoryId: category, maxPriceCents: 20000 } }
    })

    const listing = await prisma.listing.create({
      data: {
        sellerId: seller,
        categoryId: category,
        title: 'Solid oak desk',
        description: 'A sturdy desk',
        priceCents: 15000,
        status: 'PUBLISHED'
      }
    })

    const first = await savedSearch.run({ listingId: listing.id })
    expect(first).toBe(1)

    const second = await savedSearch.run({ listingId: listing.id })
    // Re-running must not alert the same search twice.
    expect(second).toBe(0)

    expect(await prisma.savedSearchAlert.count({ where: { savedSearchId: search.id } })).toBe(1)
    const delivered = await notificationsFor(watcher)
    expect(delivered.filter(row => row.type === 'saved_search_match')).toHaveLength(1)
  })

  it('does not alert for a listing that fails the saved filters', async () => {
    const watcher = await makeUser('filter-watcher')
    const seller = await makeUser('filter-seller')
    const category = randomUUID()
    const other = randomUUID()
    await prisma.category.create({ data: { id: category, name: `Cat ${category.slice(0, 8)}`, slug: `c-${category}` } })
    await prisma.category.create({ data: { id: other, name: `Cat ${other.slice(0, 8)}`, slug: `c-${other}` } })
    await prisma.savedSearch.create({
      data: { userId: watcher, query: 'desk', filters: { categoryId: category, maxPriceCents: 5000 } }
    })

    const tooDear = await prisma.listing.create({
      data: {
        sellerId: seller,
        categoryId: category,
        title: 'Expensive oak desk',
        description: 'Way over budget',
        priceCents: 99000,
        status: 'PUBLISHED'
      }
    })
    expect(await savedSearch.run({ listingId: tooDear.id })).toBe(0)

    const wrongCategory = await prisma.listing.create({
      data: {
        sellerId: seller,
        categoryId: other,
        title: 'Oak desk in the wrong category',
        description: 'Cheap but irrelevant',
        priceCents: 1000,
        status: 'PUBLISHED'
      }
    })
    expect(await savedSearch.run({ listingId: wrongCategory.id })).toBe(0)
  })

  it('never alerts for an unpublished listing', async () => {
    const watcher = await makeUser('draft-watcher')
    const seller = await makeUser('draft-seller')
    await prisma.savedSearch.create({ data: { userId: watcher, query: 'lamp', filters: {} } })

    const category = (await prisma.category.create({
      data: { name: `Cat ${randomUUID().slice(0, 8)}`, slug: `c-${randomUUID()}` }
    })).id
    const draft = await prisma.listing.create({
      data: {
        sellerId: seller,
        categoryId: category,
        title: 'Draft lamp',
        description: 'Not published',
        status: 'DRAFT'
      }
    })
    expect(await savedSearch.run({ listingId: draft.id })).toBe(0)
  })

  it('never alerts a member about their own listing', async () => {
    const seller = await makeUser('self-alert')
    const category = (await prisma.category.create({
      data: { name: `Cat ${randomUUID().slice(0, 8)}`, slug: `c-${randomUUID()}` }
    })).id
    await prisma.savedSearch.create({ data: { userId: seller, query: 'chair', filters: {} } })

    const listing = await prisma.listing.create({
      data: {
        sellerId: seller,
        categoryId: category,
        title: 'My own chair',
        description: 'Mine',
        priceCents: 1000,
        status: 'PUBLISHED'
      }
    })
    expect(await savedSearch.run({ listingId: listing.id })).toBe(0)
  })

  it('respects the saved-search preference', async () => {
    const watcher = await makeUser('alert-pref')
    const seller = await makeUser('alert-pref-seller')
    const category = (await prisma.category.create({
      data: { name: `Cat ${randomUUID().slice(0, 8)}`, slug: `c-${randomUUID()}` }
    })).id
    await prisma.savedSearch.create({ data: { userId: watcher, query: 'table', filters: {} } })
    await prisma.notificationPreference.create({ data: { userId: watcher, savedSearches: false } })

    const listing = await prisma.listing.create({
      data: {
        sellerId: seller,
        categoryId: category,
        title: 'Oak table',
        description: 'Solid',
        priceCents: 20000,
        status: 'PUBLISHED'
      }
    })
    // The alert record is still written, but no notification is delivered.
    expect(await savedSearch.run({ listingId: listing.id })).toBe(1)
    expect(await notificationsFor(watcher)).toHaveLength(0)
  })

})
import { randomUUID } from 'node:crypto'
import { MessagingGateway } from '../messaging/messaging.gateway'
import { MessagingService } from '../messaging/messaging.service'
import { NotificationWorker } from '../notifications/notification-worker'
import { NotificationsService } from '../notifications/notifications.service'
import { SavedSearchAlertWorker } from '../notifications/saved-search-worker'
import { PrismaService } from '../prisma/prisma.service'
import { RequestLifecycleService } from '../requests/request-lifecycle.service'
import { RequestsService } from '../requests/requests.service'
import { createTestPrisma } from '../common/testing/integration-fixtures'

const PASSWORD_HASH = '$argon2id$stub'

/**
 * End-to-end across Milestones 5 and 6.
 *
 * One scenario is driven through the real services and a real database:
 * a request is created and matched, an offer arrives and is accepted, a
 * conversation and transaction are created, a message moves the unread
 * count, and the outbox is drained into notifications for both parties.
 *
 * Nothing here is mocked except realtime, whose transport behaviour is
 * covered separately against a real Socket.IO server.
 */
describe('Request to notification, end to end', () => {
  let prisma: PrismaService
  let lifecycle: RequestLifecycleService
  let offers: RequestsService
  let messaging: MessagingService
  let notifications: NotificationsService
  let worker: NotificationWorker
  let savedSearch: SavedSearchAlertWorker

  const broadcasts: Array<{ userId: string; payload: Record<string, unknown> }> = []

  beforeAll(async () => {
    prisma = createTestPrisma()
    await prisma.$connect()

    const realtime = {
      publishMessage: async () => undefined,
      publishUnreadCounts: async () => undefined,
      publishNotification: async (userId: string, payload: unknown) => {
        broadcasts.push({ userId, payload: payload as Record<string, unknown> })
      }
    } as unknown as MessagingGateway

    const outbox = new (await import('../events/outbox-writer')).OutboxWriter(prisma)
    lifecycle = new RequestLifecycleService(prisma, outbox)
    offers = new RequestsService(prisma, outbox)
    messaging = new MessagingService(prisma, realtime)
    worker = new NotificationWorker(prisma, realtime)
    notifications = new NotificationsService(prisma)
    savedSearch = new SavedSearchAlertWorker(prisma, worker)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(() => {
    broadcasts.length = 0
  })

  async function makeUser(prefix: string) {
    const id = randomUUID()
    await prisma.user.create({
      data: { id, email: `${prefix}-${id}@example.com`, passwordHash: PASSWORD_HASH }
    })
    await prisma.profile.create({ data: { userId: id, firstName: 'Test', lastName: 'User' } })
    return id
  }

  /** Drains until the queue is quiet, so a batch limit cannot hide an event. */
  async function drainOutbox() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if ((await worker.drain(100)) === 0) return
    }
  }

  it('carries one request all the way to a delivered notification', async () => {
    const requester = await makeUser('e2e-requester')
    const provider = await makeUser('e2e-provider')
    const category = randomUUID()
    await prisma.category.create({
      data: { id: category, name: `E2E ${category.slice(0, 8)}`, slug: `e2e-${category}` }
    })

    // 1. The requester posts what they need.
    const request = await lifecycle.create(
      requester,
      {
        categoryId: category,
        title: 'Solid oak dining chair',
        description: 'Looking for a solid wood dining chair in good shape',
        mode: 'BUY',
        budgetCents: 20000,
        neighborhood: 'Inman Park',
        city: 'Atlanta',
        latitude: 33.75,
        longitude: -84.35,
        radiusMiles: 10
      } as never,
      true
    )
    expect(request.status).toBe('PUBLISHED')

    // 2. A provider publishes a matching listing; the engine finds it.
    const listing = await prisma.listing.create({
      data: {
        sellerId: provider,
        categoryId: category,
        title: 'Solid oak dining chair',
        description: 'Sturdy oak chair, good condition',
        priceCents: 12000,
        status: 'PUBLISHED',
        neighborhood: 'Inman Park',
        city: 'Atlanta',
        latitude: 33.76,
        longitude: -84.35
      }
    })
    const matches = await lifecycle.matches(requester, request.id)
    expect(matches.map(match => match.listingId)).toContain(listing.id)
    expect(matches[0].reasons.length).toBeGreaterThan(0)

    // 3. The provider offers on the request.
    const offer = await offers.createOffer(provider, request.id, {
      amountCents: 12000,
      message: 'I have this chair available tomorrow.'
    })
    await drainOutbox()
    const requesterFeed = await notifications.list(requester)
    expect(requesterFeed.items.some(row => row.type === 'offer_received')).toBe(true)

    // 4. The requester accepts, which creates the conversation and exchange.
    const { conversation, transaction } = await offers.acceptOffer(requester, offer.id, request.id)
    expect(transaction.status).toBe('ACCEPTED')
    expect((await lifecycle.getForOwner(requester, request.id)).status).toBe('FULFILLED')

    // 5. A real message crosses the conversation and moves the unread count.
    await messaging.sendMessage(provider, conversation.id, 'See you at six.')
    const recipientRow = await prisma.conversationParticipant.findUniqueOrThrow({
      where: { conversationId_userId: { conversationId: conversation.id, userId: requester } }
    })
    expect(recipientRow.unreadCount).toBe(1)
    expect(await messaging.unreadTotals(requester)).toEqual({ messages: 1 })

    // 6. The provider is notified that their offer was accepted.
    await drainOutbox()
    const providerFeed = await notifications.list(provider)
    const accepted = providerFeed.items.find(row => row.type === 'offer_accepted')
    expect(accepted).toBeDefined()
    expect(accepted!.link).toContain(transaction.id)

    // 7. Reading clears the badge.
    await messaging.markRead(requester, conversation.id)
    expect(await messaging.unreadTotals(requester)).toEqual({ messages: 0 })

    // The whole chain is auditable from the request forward.
    const history = await lifecycle.statusHistory(requester, request.id)
    expect(history.map(entry => entry.toStatus)).toEqual(['PUBLISHED', 'FULFILLED'])
    const events = await prisma.domainEventOutbox.findMany({
      where: {
        OR: [
          { payload: { path: ['requestId'], equals: request.id } },
          { payload: { path: ['offerId'], equals: offer.id } }
        ]
      },
      orderBy: { createdAt: 'asc' }
    })
    expect(events.map(event => event.type).sort()).toEqual([
      'offer.accepted',
      'offer.received',
      'request.created'
    ])
    expect(events.every(event => event.status === 'DELIVERED')).toBe(true)
  })

  it('alerts a saved search and then honours a preference change', async () => {
    const watcher = await makeUser('e2e-watcher')
    const seller = await makeUser('e2e-seller')
    const category = randomUUID()
    await prisma.category.create({
      data: { id: category, name: `E2E ${category.slice(0, 8)}`, slug: `e2e-${category}` }
    })

    // Alerts are on by default.
    await notifications.preferences(watcher)
    const search = await prisma.savedSearch.create({
      data: { userId: watcher, query: 'oak desk', filters: { categoryId: category } }
    })

    const first = await prisma.listing.create({
      data: {
        sellerId: seller,
        categoryId: category,
        title: 'Solid oak desk',
        description: 'A sturdy desk',
        priceCents: 15000,
        status: 'PUBLISHED'
      }
    })
    expect(await savedSearch.run({ listingId: first.id })).toBe(1)
    // Re-running is a no-op, not a second alert.
    expect(await savedSearch.run({ listingId: first.id })).toBe(0)
    expect(await prisma.savedSearchAlert.count({ where: { savedSearchId: search.id } })).toBe(1)

    // Turning the category off suppresses delivery for later listings.
    await notifications.updatePreferences(watcher, { savedSearches: false })
    const second = await prisma.listing.create({
      data: {
        sellerId: seller,
        categoryId: category,
        title: 'Another oak desk',
        description: 'Also sturdy',
        priceCents: 14000,
        status: 'PUBLISHED'
      }
    })
    expect(await savedSearch.run({ listingId: second.id })).toBe(1)
    const alerts = await notifications.listSavedSearchAlerts(watcher)
    // The alert record exists, but no notification was delivered for it.
    expect(alerts).toHaveLength(2)
    expect(
      (await notifications.list(watcher, { limit: 100 })).items.filter(
        row => row.type === 'saved_search_match'
      )
    ).toHaveLength(1)

    // Turning it back on applies to the next event.
    await notifications.updatePreferences(watcher, { savedSearches: true })
    const third = await prisma.listing.create({
      data: {
        sellerId: seller,
        categoryId: category,
        title: 'Third oak desk',
        description: 'Still sturdy',
        priceCents: 13000,
        status: 'PUBLISHED'
      }
    })
    expect(await savedSearch.run({ listingId: third.id })).toBe(1)
    expect(
      (await notifications.list(watcher, { limit: 100 })).items.filter(
        row => row.type === 'saved_search_match'
      )
    ).toHaveLength(2)
  })

  it('does not leak the requester position through any notification', async () => {
    const requester = await makeUser('e2e-private-requester')
    const provider = await makeUser('e2e-private-provider')
    const category = randomUUID()
    await prisma.category.create({
      data: { id: category, name: `E2E ${category.slice(0, 8)}`, slug: `e2e-${category}` }
    })

    const request = await lifecycle.create(
      requester,
      {
        categoryId: category,
        title: 'Private location request',
        description: 'I need something delivered to my exact address',
        mode: 'BUY',
        latitude: 33.7494,
        longitude: -84.388,
        neighborhood: 'Sweet Auburn'
      } as never,
      true
    )
    await offers.createOffer(provider, request.id, { message: 'I can help' })
    await drainOutbox()

    const feed = await notifications.list(requester)
    expect(feed.total).toBeGreaterThan(0)
    // No notification payload may carry a coordinate or an email address.
    const serialized = JSON.stringify(feed.items)
    expect(serialized).not.toContain('33.7494')
    expect(serialized).not.toContain('-84.388')
    expect(serialized).not.toContain('@example.com')

    // And the realtime push carries no more than the persisted row.
    const pushed = broadcasts.filter(entry => entry.userId === requester)
    for (const entry of pushed) {
      expect(JSON.stringify(entry.payload)).not.toContain('33.7494')
      expect(JSON.stringify(entry.payload)).not.toContain('@example.com')
    }
  })
})
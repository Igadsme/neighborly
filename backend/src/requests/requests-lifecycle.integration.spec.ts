import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { OfferStatus, RequestStatus } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { OutboxWriter } from '../events/outbox-writer'
import { RequestLifecycleService } from '../requests/request-lifecycle.service'
import { RequestsService } from '../requests/requests.service'
import { PrismaService } from '../prisma/prisma.service'
import { createTestPrisma } from '../common/testing/integration-fixtures'

const PASSWORD_HASH = '$argon2id$stub'

describe('Request lifecycle, matching, and offers against real PostgreSQL', () => {
  let prisma: PrismaService
  let lifecycle: RequestLifecycleService
  let offers: RequestsService
  let category: string

  beforeAll(async () => {
    prisma = createTestPrisma()
    await prisma.$connect()
    const outbox = new OutboxWriter(prisma)
    lifecycle = new RequestLifecycleService(prisma, outbox)
    offers = new RequestsService(prisma, outbox)
    category = '50000000-0000-4000-8000-000000000910'
    await prisma.category.upsert({
      where: { id: category },
      update: {},
      create: { id: category, name: 'M5 Requests', slug: 'm5-requests' }
    })
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

  /**
   * The suite shares one database, so a matching test would otherwise see
   * listings left behind by earlier tests. Each gets its own category.
   */
  async function isolatedCategory(label: string) {
    const id = randomUUID()
    await prisma.category.create({
      data: { id, name: `M5 ${label} ${id.slice(0, 8)}`, slug: `m5-${label}-${id}` }
    })
    return id
  }

  async function makeRequest(requesterId: string, overrides: Record<string, unknown> = {}) {
    return lifecycle.create(requesterId, {
      categoryId: category,
      title: 'Oak dining chair',
      description: 'Looking for a solid wood dining chair in good shape',
      mode: 'BUY',
      budgetCents: 20000,
      neighborhood: 'Inman Park',
      city: 'Atlanta',
      latitude: 33.75,
      longitude: -84.35,
      radiusMiles: 10,
      ...overrides
    } as never, true)
  }

  async function makeListing(sellerId: string, overrides: Record<string, unknown> = {}) {
    return prisma.listing.create({
      data: {
        sellerId,
        categoryId: category,
        title: 'Solid oak dining chair',
        description: 'Sturdy oak chair, good condition',
        priceCents: 12000,
        status: 'PUBLISHED',
        neighborhood: 'Inman Park',
        city: 'Atlanta',
        latitude: 33.76,
        longitude: -84.35,
        ...overrides
      } as never
    })
  }

  // ---------------------------------------------------------------- lifecycle

  it('creates a published request with history and an outbox event', async () => {
    const requester = await makeUser('req-create')
    const request = await makeRequest(requester)
    expect(request.status).toBe('PUBLISHED')
    expect(request).not.toHaveProperty('latitude')
    expect(request.approximateLocation).toEqual({ lat: 33.8, lng: -84.3 })

    const history = await lifecycle.statusHistory(requester, request.id)
    expect(history).toHaveLength(1)
    expect(history[0].toStatus).toBe('PUBLISHED')

    const events = await prisma.domainEventOutbox.findMany({ where: { type: 'request.created' } })
    expect(events.some(event => (event.payload as { requestId: string }).requestId === request.id)).toBe(true)
  })

  it('creates a draft that nobody but the owner can see', async () => {
    const requester = await makeUser('req-draft')
    const outsider = await makeUser('req-draft-other')
    const draft = await lifecycle.create(
      requester,
      { categoryId: category, title: 'Secret draft', description: 'Not ready to publish yet', mode: 'BUY' } as never,
      false
    )
    expect(draft.status).toBe('DRAFT')

    await expect(lifecycle.get(draft.id)).rejects.toBeInstanceOf(NotFoundException)
    await expect(lifecycle.get(draft.id, outsider)).rejects.toBeInstanceOf(NotFoundException)
    await expect(lifecycle.getForOwner(outsider, draft.id)).rejects.toBeInstanceOf(NotFoundException)

    const owner = await lifecycle.getForOwner(requester, draft.id)
    expect(owner.id).toBe(draft.id)
  })

  it('creates an empty draft from the wizard', async () => {
    const requester = await makeUser('req-wizard')
    const draft = await lifecycle.saveDraft(requester, {} as never)
    expect(draft.status).toBe('DRAFT')
    expect(draft.title).toBeTruthy()
  })

  it('walks draft to published to paused and back', async () => {
    const requester = await makeUser('req-walk')
    const draft = await lifecycle.create(
      requester,
      { categoryId: category, title: 'Draft to publish', description: 'A description long enough', mode: 'BUY' } as never,
      false
    )

    expect((await lifecycle.transition(requester, draft.id, RequestStatus.PUBLISHED)).status).toBe('PUBLISHED')
    expect((await lifecycle.transition(requester, draft.id, RequestStatus.PAUSED)).status).toBe('PAUSED')
    expect((await lifecycle.transition(requester, draft.id, RequestStatus.PUBLISHED)).status).toBe('PUBLISHED')

    const history = await lifecycle.statusHistory(requester, draft.id)
    expect(history.map(entry => entry.toStatus)).toEqual(['DRAFT', 'PUBLISHED', 'PAUSED', 'PUBLISHED'])
  })

  it('rejects an illegal transition without changing state', async () => {
    const requester = await makeUser('req-illegal')
    const request = await makeRequest(requester)

    await expect(lifecycle.transition(requester, request.id, RequestStatus.CANCELLED)).resolves.toMatchObject({
      status: 'CANCELLED'
    })
    // A cancelled request is terminal.
    await expect(lifecycle.transition(requester, request.id, RequestStatus.PUBLISHED)).rejects.toThrow(
      'Invalid request transition'
    )
    await expect(lifecycle.transition(requester, request.id, RequestStatus.FULFILLED)).rejects.toThrow(
      'Invalid request transition'
    )
  })

  it('refuses to edit a cancelled or fulfilled request', async () => {
    const requester = await makeUser('req-edit-locked')
    const cancelled = await makeRequest(requester)
    await lifecycle.transition(requester, cancelled.id, RequestStatus.CANCELLED)
    await expect(
      lifecycle.update(requester, cancelled.id, { title: 'New title' } as never)
    ).rejects.toThrow('can no longer be edited')

    const fulfilled = await makeRequest(requester, { title: 'To be fulfilled' })
    await lifecycle.transition(requester, fulfilled.id, RequestStatus.FULFILLED)
    await expect(
      lifecycle.update(requester, fulfilled.id, { title: 'New title' } as never)
    ).rejects.toThrow('can no longer be edited')
  })

  it('records fulfilledAt when a request is fulfilled', async () => {
    const requester = await makeUser('req-fulfilled')
    const request = await makeRequest(requester)
    const result = await lifecycle.transition(requester, request.id, RequestStatus.FULFILLED)
    expect(result.fulfilledAt).not.toBeNull()
  })

  it('refuses every mutation by a user who does not own the request', async () => {
    const requester = await makeUser('req-owner')
    const outsider = await makeUser('req-outsider')
    const request = await makeRequest(requester)

    await expect(lifecycle.update(outsider, request.id, { title: 'Hijacked' } as never)).rejects.toBeInstanceOf(
      NotFoundException
    )
    await expect(lifecycle.transition(outsider, request.id, RequestStatus.PAUSED)).rejects.toBeInstanceOf(
      NotFoundException
    )
    await expect(lifecycle.matches(outsider, request.id)).rejects.toBeInstanceOf(NotFoundException)
    await expect(lifecycle.statusHistory(outsider, request.id)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('keeps requester coordinates private from everyone else', async () => {
    const requester = await makeUser('req-coords')
    const stranger = await makeUser('req-coords-other')
    const request = await makeRequest(requester)

    const publicView = await lifecycle.get(request.id)
    const strangerView = await lifecycle.get(request.id, stranger)
    const ownerView = await lifecycle.getForOwner(requester, request.id)

    for (const view of [publicView, strangerView, ownerView]) {
      expect(view).not.toHaveProperty('latitude')
      expect(view).not.toHaveProperty('longitude')
      expect(JSON.stringify(view)).not.toContain('33.75')
    }
    // Only the owner is told a location is stored at all.
    expect(ownerView.coordinatesShared).toBe(true)
    expect(strangerView.coordinatesShared).toBeUndefined()
  })

  it('lists only the caller own requests', async () => {
    const mine = await makeUser('req-list-mine')
    const other = await makeUser('req-list-other')
    const first = await makeRequest(mine, { title: 'Mine one' })
    await makeRequest(other, { title: 'Theirs one' })

    const list = await lifecycle.listMine(mine, {})
    const ids = list.map(entry => entry.id)
    expect(ids).toContain(first.id)
    expect(list.every(entry => entry.requesterId === mine)).toBe(true)
  })

  // ---------------------------------------------------------------- discovery

  it('searches and paginates deterministically', async () => {
    const requester = await makeUser('req-search')
    const marker = randomUUID().slice(0, 8)
    const created = []
    for (let index = 0; index < 5; index += 1) {
      created.push(await makeRequest(requester, { title: `Search ${marker} ${index}`, budgetCents: 1000 + index }))
    }

    const first = await lifecycle.list({ query: `Search ${marker}`, limit: 2, offset: 0, sort: 'budget_asc' })
    const second = await lifecycle.list({ query: `Search ${marker}`, limit: 2, offset: 2, sort: 'budget_asc' })

    expect(first.total).toBe(5)
    const ids = [...first.items, ...second.items].map(entry => entry.id)
    expect(new Set(ids).size).toBe(4)

    for (const request of created) await lifecycle.transition(requester, request.id, RequestStatus.CANCELLED)
  })

  it('filters by category, budget, and city', async () => {
    const requester = await makeUser('req-filter')
    const request = await makeRequest(requester, {
      title: 'Filtered request',
      budgetCents: 30000,
      city: 'Savannah'
    })
    expect((await lifecycle.list({ categoryId: category })).items.map(r => r.id)).toContain(request.id)
    expect((await lifecycle.list({ city: 'savannah' })).items.map(r => r.id)).toContain(request.id)
    expect((await lifecycle.list({ minBudgetCents: 25000 })).items.map(r => r.id)).toContain(request.id)
    expect((await lifecycle.list({ maxBudgetCents: 5000 })).items.map(r => r.id)).not.toContain(request.id)
  })

  it('filters by radius', async () => {
    const requester = await makeUser('req-radius')
    const near = await makeRequest(requester, { title: 'Near request', latitude: 33.76, longitude: -84.35 })
    const far = await makeRequest(requester, { title: 'Far request', latitude: 34.5, longitude: -84.35 })

    const page = await lifecycle.list({ latitude: 33.75, longitude: -84.35, radiusMiles: 5 })
    const ids = page.items.map(entry => entry.id)
    expect(ids).toContain(near.id)
    expect(ids).not.toContain(far.id)
  })

  it('hides expired requests when the caller asks for open ones', async () => {
    const requester = await makeUser('req-expiry')
    const open = await makeRequest(requester, { title: 'Open request' })
    const closed = await makeRequest(requester, {
      title: 'Closed request',
      deadline: new Date(Date.now() - 86_400_000).toISOString()
    })

    const page = await lifecycle.list({ openOnly: true })
    const ids = page.items.map(entry => entry.id)
    expect(ids).toContain(open.id)
    expect(ids).not.toContain(closed.id)
  })

  it('never exposes a draft through the public feed', async () => {
    const requester = await makeUser('req-feed-draft')
    const draft = await lifecycle.create(
      requester,
      { categoryId: category, title: 'Hidden draft', description: 'Not public at all', mode: 'BUY' } as never,
      false
    )
    const page = await lifecycle.list({})
    expect(page.items.map(entry => entry.id)).not.toContain(draft.id)
    // Even an explicit DRAFT status filter cannot surface it publicly.
    const forced = await lifecycle.list({ status: RequestStatus.DRAFT })
    expect(forced.items.map(entry => entry.id)).not.toContain(draft.id)
  })

  // ----------------------------------------------------------------- matching

  it('ranks a matching listing above an irrelevant one and explains why', async () => {
    const requester = await makeUser('match-rank')
    const seller = await makeUser('match-seller')
    const own = await isolatedCategory('rank')
    const request = await makeRequest(requester, { categoryId: own, title: 'Ranked oak dining chair' })

    const good = await makeListing(seller, { categoryId: own, title: 'Ranked oak dining chair', priceCents: 12000 })
    const weak = await makeListing(seller, {
      categoryId: own,
      title: 'Unrelated lamp',
      description: 'A lamp, nothing to do with chairs',
      priceCents: 19000,
    })

    const matches = await lifecycle.matches(requester, request.id)
    const ids = matches.map(match => match.listingId)
    expect(ids).toContain(good.id)
    expect(ids).toContain(weak.id)
    expect(ids.indexOf(good.id)).toBeLessThan(ids.indexOf(weak.id))
    expect(matches[0].reasons.length).toBeGreaterThan(0)
    expect(matches[0].score).toBeGreaterThan(0)
  })

  it('never matches the requester own listings', async () => {
    const requester = await makeUser('match-self')
    const own = await isolatedCategory('self')
    const request = await makeRequest(requester, { categoryId: own, title: 'Self-match chair' })
    await makeListing(requester, { categoryId: own, title: 'Self-match chair' })

    const matches = await lifecycle.matches(requester, request.id)
    expect(matches).toHaveLength(0)
  })

  it('never matches a blocked member', async () => {
    const requester = await makeUser('match-blocker')
    const blocked = await makeUser('match-blocked')
    await prisma.blockedUser.create({ data: { blockerId: requester, blockedId: blocked } })
    const own = await isolatedCategory('blocked')
    const request = await makeRequest(requester, { categoryId: own, title: 'Blocked chair' })

    const listing = await makeListing(blocked, { categoryId: own, title: 'Blocked chair' })
    const matches = await lifecycle.matches(requester, request.id)
    expect(matches.map(match => match.listingId)).not.toContain(listing.id)
  })

  it('never matches an unpublished or archived listing', async () => {
    const requester = await makeUser('match-inactive')
    const seller = await makeUser('match-inactive-seller')
    const own = await isolatedCategory('inactive')
    const request = await makeRequest(requester, { categoryId: own, title: 'Inactive chair' })

    const draft = await prisma.listing.create({
      data: {
        sellerId: seller,
        categoryId: own,
        title: 'Inactive chair draft',
        description: 'Not published yet',
        status: 'DRAFT'
      }
    })
    const archived = await makeListing(seller, {
      categoryId: own,
      title: 'Inactive chair archived',
      status: 'ARCHIVED'
    })

    const matches = await lifecycle.matches(requester, request.id)
    const ids = matches.map(match => match.listingId)
    expect(ids).not.toContain(draft.id)
    expect(ids).not.toContain(archived.id)
  })

  it('persists the ranking and its reasons so a reload matches', async () => {
    const requester = await makeUser('match-persist')
    const seller = await makeUser('match-persist-seller')
    const own = await isolatedCategory('persist')
    const request = await makeRequest(requester, { categoryId: own, title: 'Persisted chair' })
    const listing = await makeListing(seller, { categoryId: own, title: 'Persisted chair' })

    await lifecycle.matches(requester, request.id)
    const stored = await prisma.requestMatch.findMany({ where: { requestId: request.id } })
    expect(stored).toHaveLength(1)
    expect(stored[0].listingId).toBe(listing.id)
    expect(stored[0].rank).toBe(1)
    expect(Array.isArray(stored[0].reasons)).toBe(true)

    // Re-running replaces rather than duplicating.
    await lifecycle.matches(requester, request.id)
    expect(await prisma.requestMatch.count({ where: { requestId: request.id } })).toBe(1)
  })

  it('respects the radius when matching', async () => {
    const requester = await makeUser('match-radius')
    const seller = await makeUser('match-radius-seller')
    const own = await isolatedCategory('radius')
    const request = await makeRequest(requester, { categoryId: own, title: 'Radius chair' })
    await makeListing(seller, { categoryId: own, title: 'Radius chair far away', latitude: 34.4 })

    const matches = await lifecycle.matches(requester, request.id)
    expect(matches).toHaveLength(0)
  })

  // ------------------------------------------------------------------- offers

  it('submits an offer and notifies the requester through the outbox', async () => {
    const requester = await makeUser('offer-new')
    const offerer = await makeUser('offer-newer')
    const request = await makeRequest(requester)

    const offer = await offers.createOffer(offerer, request.id, {
      amountCents: 15000,
      message: 'I can bring it tomorrow'
    })

    const events = await prisma.domainEventOutbox.findMany({ where: { type: 'offer.received' } })
    const mine = events.find(event => (event.payload as { offerId: string }).offerId === offer.id)
    expect(mine).toBeDefined()
    expect((mine!.payload as { requesterId: string }).requesterId).toBe(requester)
  })

  it('refuses an offer on a request that is not published', async () => {
    const requester = await makeUser('offer-draft')
    const offerer = await makeUser('offer-drafter')
    const draft = await lifecycle.create(
      requester,
      { categoryId: category, title: 'Draft no offers', description: 'Not published yet', mode: 'BUY' } as never,
      false
    )
    await expect(
      offers.createOffer(offerer, draft.id, { message: 'Interested' })
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('refuses an offer on the requester own request', async () => {
    const requester = await makeUser('offer-self')
    const request = await makeRequest(requester)
    await expect(offers.createOffer(requester, request.id, { message: 'Mine' })).rejects.toThrow(
      'your own request'
    )
  })

  it('edits and withdraws an offer while it is negotiable', async () => {
    const requester = await makeUser('offer-edit')
    const offerer = await makeUser('offer-editor')
    const request = await makeRequest(requester)
    const offer = await offers.createOffer(offerer, request.id, { amountCents: 10000, message: 'Initial' })

    const edited = await offers.editOffer(offerer, offer.id, { amountCents: 14000, message: 'Revised' })
    expect(edited.amountCents).toBe(14000)
    expect(edited.message).toBe('Revised')

    const withdrawn = await offers.withdrawOffer(offerer, offer.id)
    expect(withdrawn.status).toBe(OfferStatus.WITHDRAWN)
  })

  it('refuses to edit or withdraw another member offer', async () => {
    const requester = await makeUser('offer-x-owner')
    const offerer = await makeUser('offer-x-owner2')
    const stranger = await makeUser('offer-x-stranger')
    const request = await makeRequest(requester)
    const offer = await offers.createOffer(offerer, request.id, { message: 'Hello' })

    await expect(offers.editOffer(stranger, offer.id, { amountCents: 1 })).rejects.toBeInstanceOf(ForbiddenException)
    await expect(offers.withdrawOffer(stranger, offer.id)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(offers.getOffer(stranger, offer.id)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('refuses to edit an offer once it has been accepted', async () => {
    const requester = await makeUser('offer-locked')
    const offerer = await makeUser('offer-locked2')
    const request = await makeRequest(requester)
    const offer = await offers.createOffer(offerer, request.id, { amountCents: 9000, message: 'Final' })
    await offers.acceptOffer(requester, offer.id, request.id)

    await expect(offers.editOffer(offerer, offer.id, { amountCents: 1 })).rejects.toThrow('no longer be edited')
    await expect(offers.withdrawOffer(offerer, offer.id)).rejects.toThrow('cannot be withdrawn')
  })

  it('shows an offerer only their own offer on a request', async () => {
    const requester = await makeUser('offer-compare')
    const first = await makeUser('offer-compare-1')
    const second = await makeUser('offer-compare-2')
    const request = await makeRequest(requester)
    const mine = await offers.createOffer(first, request.id, { amountCents: 10000, message: 'Mine' })
    await offers.createOffer(second, request.id, { amountCents: 20000, message: 'Theirs' })

    const asRequester = await offers.listOffersForRequest(requester, request.id)
    expect(asRequester).toHaveLength(2)

    // One provider must not be able to price-shop against the other.
    const asOfferer = await offers.listOffersForRequest(first, request.id)
    expect(asOfferer).toHaveLength(1)
    expect(asOfferer[0].id).toBe(mine.id)
  })

  it('rejects an offer and notifies the offerer', async () => {
    const requester = await makeUser('offer-reject')
    const offerer = await makeUser('offer-rejectee')
    const request = await makeRequest(requester)
    const offer = await offers.createOffer(offerer, request.id, { amountCents: 5000, message: 'Too cheap?' })

    const rejected = await offers.rejectOffer(requester, offer.id, request.id)
    expect(rejected.status).toBe(OfferStatus.REJECTED)

    const events = await prisma.domainEventOutbox.findMany({ where: { type: 'offer.rejected' } })
    expect(events.some(event => (event.payload as { offerId: string }).offerId === offer.id)).toBe(true)
    await expect(offers.rejectOffer(requester, offer.id, request.id)).rejects.toThrow('no longer rejectable')
  })

  // ------------------------------------------------- acceptance and workflow

  it('fulfils the request and creates exactly one exchange on acceptance', async () => {
    const requester = await makeUser('accept-req')
    const offerer = await makeUser('accept-offer')
    const request = await makeRequest(requester)
    const offer = await offers.createOffer(offerer, request.id, { amountCents: 12000, message: 'Available' })

    const result = await offers.acceptOffer(requester, offer.id, request.id)
    expect(result.transaction.offerId).toBe(offer.id)
    expect(result.transaction.status).toBe('ACCEPTED')

    const after = await lifecycle.getForOwner(requester, request.id)
    expect(after.status).toBe('FULFILLED')
    expect(after.fulfilledAt).not.toBeNull()

    const events = await prisma.domainEventOutbox.findMany({ where: { type: 'offer.accepted' } })
    const mine = events.find(event => (event.payload as { offerId: string }).offerId === offer.id)
    expect(mine).toBeDefined()
    expect((mine!.payload as { conversationId: string }).conversationId).toBe(result.conversation.id)
  })

  it('produces exactly one exchange from two concurrent accepts', async () => {
    const requester = await makeUser('accept-race')
    const offerer = await makeUser('accept-racer')
    const request = await makeRequest(requester)
    const offer = await offers.createOffer(offerer, request.id, { amountCents: 8000, message: 'Mine' })

    const outcomes = await Promise.allSettled([
      offers.acceptOffer(requester, offer.id, request.id),
      offers.acceptOffer(requester, offer.id, request.id)
    ])
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(outcome => outcome.status === 'rejected')).toHaveLength(1)

    expect(await prisma.transaction.count({ where: { offerId: offer.id } })).toBe(1)
    expect(await prisma.conversation.count({ where: { transactions: { some: { offerId: offer.id } } } })).toBe(1)
  })

  it('is idempotent when an acceptance is retried', async () => {
    const requester = await makeUser('accept-retry')
    const offerer = await makeUser('accept-retryee')
    const request = await makeRequest(requester)
    const offer = await offers.createOffer(offerer, request.id, { message: 'Once' })

    await offers.acceptOffer(requester, offer.id, request.id)
    await expect(offers.acceptOffer(requester, offer.id, request.id)).rejects.toThrow('no longer acceptable')
    // No duplicate side effects from the retry.
    expect(await prisma.transaction.count({ where: { offerId: offer.id } })).toBe(1)
    expect(await prisma.transactionMilestone.count({ where: { transaction: { offerId: offer.id } } })).toBe(1)
  })

  it('lets exactly one offer win when two compete', async () => {
    const requester = await makeUser('accept-two')
    const first = await makeUser('accept-two-1')
    const second = await makeUser('accept-two-2')
    const request = await makeRequest(requester)
    const firstOffer = await offers.createOffer(first, request.id, { message: 'First' })
    await offers.createOffer(second, request.id, { message: 'Second' })

    await offers.acceptOffer(requester, firstOffer.id, request.id)
    await expect(offers.acceptOffer(requester, firstOffer.id, request.id)).rejects.toThrow('no longer acceptable')

    // The losing offer stays on the request as history rather than vanishing.
    const remaining = await offers.listOffersForRequest(requester, request.id)
    expect(remaining).toHaveLength(2)
    expect(remaining.find(offer => offer.status === 'ACCEPTED')?.id).toBe(firstOffer.id)
  })

  it('refuses acceptance by anyone other than the requester', async () => {
    const requester = await makeUser('accept-auth')
    const offerer = await makeUser('accept-auther')
    const outsider = await makeUser('accept-authout')
    const request = await makeRequest(requester)
    const offer = await offers.createOffer(offerer, request.id, { message: 'Hello' })

    await expect(offers.acceptOffer(offerer, offer.id, request.id)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(offers.acceptOffer(outsider, offer.id, request.id)).rejects.toBeInstanceOf(ForbiddenException)
    expect((await prisma.requestOffer.findUniqueOrThrow({ where: { id: offer.id } })).status).toBe(
      OfferStatus.PENDING
    )
  })

  it('refuses an offer that belongs to a different request', async () => {
    const requester = await makeUser('accept-wrong-req')
    const offerer = await makeUser('accept-wrong-offerer')
    const first = await makeRequest(requester)
    const second = await makeRequest(requester, { title: 'A different request' })
    const offer = await offers.createOffer(offerer, first.id, { message: 'For the first' })

    await expect(
      offers.acceptOffer(requester, offer.id, second.id)
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('keeps the full chain auditable from request to transaction', async () => {
    const requester = await makeUser('chain')
    const offerer = await makeUser('chain-offer')
    const request = await makeRequest(requester)
    const offer = await offers.createOffer(offerer, request.id, { amountCents: 12000, message: 'Chain' })
    const { conversation, transaction } = await offers.acceptOffer(requester, offer.id, request.id)

    const history = await lifecycle.statusHistory(requester, request.id)
    // Published at creation, then fulfilled by the acceptance.
    expect(history.map(entry => entry.toStatus)).toEqual(['PUBLISHED', 'FULFILLED'])

    const milestones = await prisma.transactionMilestone.findMany({ where: { transactionId: transaction.id } })
    expect(milestones[0].toStatus).toBe('ACCEPTED')

    const participants = await prisma.conversationParticipant.count({
      where: { conversationId: conversation.id }
    })
    expect(participants).toBe(2)

    // Scoped to this chain: the shared database holds events from every other
    // test in the suite.
    const events = await prisma.domainEventOutbox.findMany({
      where: {
        type: { in: ['request.created', 'offer.received', 'offer.accepted'] },
        OR: [
          { payload: { path: ['requestId'], equals: request.id } },
          { payload: { path: ['offerId'], equals: offer.id } }
        ]
      }
    })
    expect(events.map(event => event.type).sort()).toEqual([
      'offer.accepted',
      'offer.received',
      'request.created'
    ])
  })
})

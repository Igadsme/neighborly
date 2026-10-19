import { randomUUID } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'
import { ListingsService } from '../listings/listings.service'
import { PrismaService } from '../prisma/prisma.service'
import { createTestPrisma } from '../common/testing/integration-fixtures'
import { stubStorage } from '../common/testing/stub-storage'

const PASSWORD_HASH = '$argon2id$stub'

/**
 * Listing behavior against real PostgreSQL: lifecycle transitions,
 * authorization, pagination, search, price and radius filters, and the
 * coordinate-privacy guarantee.
 */
describe('Listing lifecycle and discovery against real PostgreSQL', () => {
  let prisma: PrismaService
  let service: ListingsService
  let seller: string
  let other: string
  let category: string

  beforeAll(async () => {
    prisma = createTestPrisma()
    await prisma.$connect()
    service = new ListingsService(prisma, stubStorage().provider.useValue)
    category = await prisma.category.upsert({
      where: { id: '50000000-0000-4000-8000-000000000900' },
      update: {},
      create: { id: '50000000-0000-4000-8000-000000000900', name: 'M4 Furniture', slug: 'm4-furniture' }
    }).then(row => row.id)
    seller = await makeUser('seller')
    other = await makeUser('other')
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

  async function makeListing(overrides: Record<string, unknown> = {}) {
    return service.create(seller, {
      categoryId: category,
      title: 'Oak dining chair',
      description: 'Solid oak dining chair in good shape',
      priceCents: 4500,
      neighborhood: 'Inman Park',
      city: 'Atlanta',
      latitude: 33.75,
      longitude: -84.35,
      ...overrides
    } as never)
  }

  /** Moves `milesNorth` and `milesEast` from an origin using the WGS84 degree lengths PostGIS uses. */
  function shift(origin: { latitude: number; longitude: number }, milesNorth: number, milesEast: number) {
    const meters = 1609.344
    const latitude = origin.latitude + (milesNorth * meters) / 111319.9
    const longitude = origin.longitude + (milesEast * meters) / (111319.9 * Math.cos((origin.latitude * Math.PI) / 180))
    return { latitude, longitude }
  }

  // ------------------------------------------------------------------ lifecycle

  it('creates a published listing that is immediately publicly visible', async () => {
    const listing = await makeListing()
    expect(listing.status).toBe('PUBLISHED')
    const page = await service.list({})
    expect(page.items.map(item => item.id)).toContain(listing.id)
    await service.remove(seller, listing.id)
  })

  it('saves a draft that no public reader can see', async () => {
    const draft = await service.saveDraft(seller, { categoryId: category, title: 'Unfinished workbench', description: 'Not ready yet' } as never)
    expect(draft.status).toBe('DRAFT')

    const page = await service.list({})
    expect(page.items.map(item => item.id)).not.toContain(draft.id)
    await expect(service.get(draft.id)).rejects.toThrow('Listing not found')

    // The owner can still read it through the management route.
    const managed = await service.getForOwner(seller, draft.id)
    expect(managed.id).toBe(draft.id)
    await service.remove(seller, draft.id)
  })

  it('walks a draft through edit, publish, and back to archived', async () => {
    const draft = await service.saveDraft(seller, { categoryId: category, title: 'Draft to publish', description: 'A description long enough' } as never)

    const edited = await service.update(seller, draft.id, { title: 'Edited before publishing', priceCents: 1500 })
    expect(edited.title).toBe('Edited before publishing')
    expect(edited.status).toBe('DRAFT')

    const published = await service.publish(seller, draft.id)
    expect(published.status).toBe('PUBLISHED')
    await expect(service.get(draft.id)).resolves.toMatchObject({ id: draft.id })

    await service.archive(seller, draft.id)
    expect((await service.getForOwner(seller, draft.id)).status).toBe('ARCHIVED')
    await expect(service.get(draft.id)).rejects.toThrow('Listing not found')

    const restored = await service.restore(seller, draft.id)
    expect(restored.status).toBe('PUBLISHED')
    expect(restored.deletedAt).toBeNull()
    await expect(service.get(draft.id)).resolves.toMatchObject({ id: draft.id })

    await service.remove(seller, draft.id)
  })

  it('refuses to publish a draft with no usable title or description', async () => {
    const draft = await service.saveDraft(seller, { categoryId: category } as never)
    await expect(service.publish(seller, draft.id)).rejects.toThrow('Add a title and description')
    await service.remove(seller, draft.id)
  })

  it('marks a listing sold and keeps it out of the published list', async () => {
    const listing = await makeListing({ title: 'Item to sell' })
    await service.markSold(seller, listing.id)

    const published = await service.list({ status: 'PUBLISHED' })
    expect(published.items.map(item => item.id)).not.toContain(listing.id)
    const sold = await service.list({ status: 'SOLD' })
    expect(sold.items.map(item => item.id)).toContain(listing.id)
    await service.remove(seller, listing.id)
  })

  it('rejects illegal transitions', async () => {
    const sold = await makeListing({ title: 'Sold item' })
    await service.markSold(seller, sold.id)
    await expect(service.restore(seller, sold.id)).rejects.toThrow('Only an archived listing can be restored')
    await service.remove(seller, sold.id)

    // Pausing an already-archived listing is idempotent.
    const archived = await makeListing({ title: 'Archived item' })
    await service.archive(seller, archived.id)
    expect((await service.pause(seller, archived.id)).status).toBe('ARCHIVED')
    await service.remove(seller, archived.id)

    // A draft cannot be paused or marked sold.
    const draft = await service.saveDraft(seller, { categoryId: category, title: 'Draft transition', description: 'Body text' } as never)
    await expect(service.pause(seller, draft.id)).rejects.toThrow('Only a published listing can be paused')
    await expect(service.markSold(seller, draft.id)).rejects.toThrow('Only a published or paused listing')
    await service.remove(seller, draft.id)
  })

  it('rejects an empty update rather than writing nothing', async () => {
    const listing = await makeListing({ title: 'Update guard' })
    await expect(service.update(seller, listing.id, {})).rejects.toThrow('No fields to update')
    await service.remove(seller, listing.id)
  })

  // ------------------------------------------------------------- authorization

  it('refuses every mutation by a user who does not own the listing', async () => {
    const listing = await makeListing({ title: 'Not yours' })
    await expect(service.update(other, listing.id, { title: 'Hijacked' })).rejects.toThrow('Forbidden')
    await expect(service.publish(other, listing.id)).rejects.toThrow('Forbidden')
    await expect(service.archive(other, listing.id)).rejects.toThrow('Forbidden')
    await expect(service.restore(other, listing.id)).rejects.toThrow('Forbidden')
    await expect(service.remove(other, listing.id)).rejects.toThrow('Forbidden')
    await expect(service.markSold(other, listing.id)).rejects.toThrow('Forbidden')
    // The listing is untouched by every rejected attempt.
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).title).toBe('Not yours')
    await service.remove(seller, listing.id)
  })

  it('refuses to attach an image to someone else\'s listing', async () => {
    const listing = await makeListing({ title: 'Image owner' })
    await expect(service.addImage(other, listing.id, { buffer: Buffer.from([0x89]) })).rejects.toThrow('Forbidden')
    await service.remove(seller, listing.id)
  })

  it('lets the owner see drafts but not another user\'s drafts', async () => {
    const draft = await service.saveDraft(seller, { categoryId: category, title: 'Private draft', description: 'Only mine' } as never)
    const mine = await service.listMine(seller)
    expect(mine.map(item => item.id)).toContain(draft.id)
    const theirs = await service.listMine(other)
    expect(theirs.map(item => item.id)).not.toContain(draft.id)
    await expect(service.getForOwner(other, draft.id)).rejects.toThrow('Listing not found')
    await service.remove(seller, draft.id)
  })

  it('filters the owner listing list by status', async () => {
    const archived = await makeListing({ title: 'Owner archived' })
    await service.archive(seller, archived.id)

    const archivedOnly = await service.listMine(seller, { status: 'ARCHIVED' })
    expect(archivedOnly.map(item => item.id)).toContain(archived.id)
    const live = await service.listMine(seller, { status: 'PUBLISHED' })
    expect(live.map(item => item.id)).not.toContain(archived.id)

    await service.remove(seller, archived.id)
  })

  // --------------------------------------------------------------------- search

  it('searches title and description and returns a total for pagination', async () => {
    const marker = randomUUID().slice(0, 8)
    const hit = await makeListing({ title: `Chair ${marker}`, description: `Unique ${marker} description here` })
    await makeListing({ title: `Unrelated ${marker}`, description: 'Nothing matching this term at all' })

    const found = await service.list({ query: marker })
    expect(found.items.map(item => item.id)).toContain(hit.id)
    expect(found.total).toBeGreaterThanOrEqual(1)
    expect(found.limit).toBe(24)

    await service.remove(seller, hit.id)
  })

  it('filters by category, city, and neighborhood', async () => {
    const listing = await makeListing({ title: 'Filtered listing', neighborhood: 'Candler Park', city: 'Atlanta' })
    const byCity = await service.list({ city: 'atlanta' })
    expect(byCity.items.map(item => item.id)).toContain(listing.id)
    const byNeighborhood = await service.list({ neighborhood: 'Candler Park' })
    expect(byNeighborhood.items.map(item => item.id)).toContain(listing.id)
    const byOtherCity = await service.list({ city: 'Savannah' })
    expect(byOtherCity.items.map(item => item.id)).not.toContain(listing.id)
    await service.remove(seller, listing.id)
  })

  it('filters by price range and rejects an inverted range', async () => {
    const cheap = await makeListing({ title: 'Cheap item', priceCents: 1500 })
    const pricey = await makeListing({ title: 'Pricey item', priceCents: 250_000 })
    const tooCheap = await makeListing({ title: 'Below range', priceCents: 200 })

    const page = await service.list({ minPriceCents: 1000, maxPriceCents: 100_000 })
    const ids = page.items.map(item => item.id)
    expect(ids).toContain(cheap.id)
    expect(ids).not.toContain(pricey.id)
    expect(ids).not.toContain(tooCheap.id)

    await expect(service.list({ minPriceCents: 5000, maxPriceCents: 1000 })).rejects.toThrow('cannot exceed')
    await service.remove(seller, cheap.id)
    await service.remove(seller, pricey.id)
    await service.remove(seller, tooCheap.id)
  })

  it('sorts by price ascending with unpriced listings last', async () => {
    const marker = randomUUID().slice(0, 8)
    const low = await makeListing({ title: `Low ${marker}`, priceCents: 1000 })
    const high = await makeListing({ title: `High ${marker}`, priceCents: 9000 })
    const unpriced = await makeListing({ title: `Unpriced ${marker}`, priceCents: undefined })

    const page = await service.list({ sort: 'price_asc', limit: 100 })
    const rows = page.items.filter(item => [low.id, high.id, unpriced.id].includes(item.id))
    const prices = rows.map(item => item.priceCents)
    const nonNull = prices.filter((value): value is number => value !== null && value !== undefined)
    expect(nonNull).toEqual([...nonNull].sort((a, b) => a - b))
    expect(prices.at(-1)).toBeNull()

    await service.remove(seller, low.id)
    await service.remove(seller, high.id)
    await service.remove(seller, unpriced.id)
  })

  it('paginates deterministically without repeating or skipping a row', async () => {
    const marker = randomUUID().slice(0, 8)
    const created = []
    for (let index = 0; index < 5; index += 1) {
      created.push(await makeListing({ title: `Page ${marker} ${index}`, priceCents: 1000 + index }))
    }

    const first = await service.list({ query: `Page ${marker}`, limit: 2, offset: 0, sort: 'price_asc' })
    const second = await service.list({ query: `Page ${marker}`, limit: 2, offset: 2, sort: 'price_asc' })
    const third = await service.list({ query: `Page ${marker}`, limit: 2, offset: 4, sort: 'price_asc' })

    const ids = [...first.items, ...second.items, ...third.items].map(item => item.id)
    expect(new Set(ids).size).toBe(5)
    expect(first.total).toBe(5)
    // Paging is global: the server filters before it takes a slice.
    expect(first.total).toBeGreaterThan(first.items.length)

    for (const listing of created) await service.remove(seller, listing.id)
  })

  it('clamps a hostile limit instead of returning everything', async () => {
    const page = await service.list({ limit: 100000 })
    expect(page.limit).toBeLessThanOrEqual(100)
  })

  it('never leaks a draft through a filtered query', async () => {
    const marker = randomUUID().slice(0, 8)
    const draft = await service.saveDraft(seller, { categoryId: category, title: `Hidden ${marker}`, description: 'Draft body' } as never)
    const page = await service.list({ query: `Hidden ${marker}` })
    expect(page.items.map(item => item.id)).not.toContain(draft.id)
    await service.remove(seller, draft.id)
  })

  // ------------------------------------------------------------------- location

  it('filters by radius and reports the distance', async () => {
    const marker = randomUUID().slice(0, 8)
    const origin = { latitude: 33.75, longitude: -84.35 }
    const near = await makeListing({ title: `Near ${marker}`, latitude: 33.755, longitude: -84.35 })
    const far = await makeListing({ title: `Far ${marker}`, latitude: 34.15, longitude: -84.35 })
    const inside = await makeListing({ title: `Inside ${marker}`, ...shift(origin, 4.9, 0) })
    const outside = await makeListing({ title: `Outside ${marker}`, ...shift(origin, 5.1, 0) })

    const nearby = await service.list({ ...origin, radiusMiles: 5, query: marker })
    const ids = nearby.items.map(item => item.id)
    expect(ids).toContain(near.id)
    expect(ids).toContain(inside.id)
    expect(ids).not.toContain(far.id)
    expect(ids).not.toContain(outside.id)

    const nearRow = nearby.items.find(item => item.id === near.id)
    // ~0.35 miles from the origin, to one decimal place.
    expect(nearRow?.distanceMiles).toBeGreaterThan(0)
    expect(nearRow?.distanceMiles).toBeLessThan(1)

    await service.remove(seller, near.id)
    await service.remove(seller, far.id)
    await service.remove(seller, inside.id)
    await service.remove(seller, outside.id)
  })

  it('keeps the radius total when the page offset is past the last row', async () => {
    const marker = randomUUID().slice(0, 8)
    const origin = { latitude: 33.75, longitude: -84.35 }
    const first = await makeListing({ title: `Past ${marker} a`, ...origin })
    const second = await makeListing({ title: `Past ${marker} b`, ...shift(origin, 1, 0) })

    const page = await service.list({ ...origin, radiusMiles: 5, query: marker, limit: 1, offset: 10 })
    expect(page.items).toEqual([])
    expect(page.total).toBe(2)

    await service.remove(seller, first.id)
    await service.remove(seller, second.id)
  })

  it('rejects coordinates and a radius the server cannot search', async () => {
    await expect(service.list({ latitude: 91, longitude: 0, radiusMiles: 5 })).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.list({ latitude: 0, longitude: 181, radiusMiles: 5 })).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.list({ latitude: 33.75, longitude: -84.35, radiusMiles: 10000 })).rejects.toBeInstanceOf(BadRequestException)
  })

  it('excludes the corner of the old bounding box and orders the circle by distance', async () => {
    const marker = randomUUID().slice(0, 8)
    const origin = { latitude: 33.75, longitude: -84.35 }
    const inside = await makeListing({ title: `Inside ${marker}`, ...shift(origin, 3, 0) })
    const corner = await makeListing({ title: `Corner ${marker}`, ...shift(origin, 5, 5) })
    const farthest = await makeListing({ title: `Far ${marker} 4`, ...shift(origin, 4, 0) })
    const nearest = await makeListing({ title: `Near ${marker} 1`, ...shift(origin, 1, 0) })
    const middle = await makeListing({ title: `Mid ${marker} 2`, ...shift(origin, 2.5, 0) })

    const page = await service.list({ ...origin, radiusMiles: 5, query: marker })
    const ids = page.items.map(item => item.id)
    expect(ids).toContain(inside.id)
    expect(ids).toContain(nearest.id)
    expect(ids).not.toContain(corner.id)
    expect(ids.indexOf(nearest.id)).toBeLessThan(ids.indexOf(middle.id))
    expect(ids.indexOf(middle.id)).toBeLessThan(ids.indexOf(farthest.id))
    const nearestRow = page.items.find(item => item.id === nearest.id)
    expect(nearestRow?.distanceMiles).toBeGreaterThan(0.5)
    expect(nearestRow?.distanceMiles).toBeLessThan(1.5)

    for (const listing of [inside, corner, farthest, nearest, middle]) await service.remove(seller, listing.id)
  })

  it('keeps paused, archived, draft, and suspended-seller rows out of a radius search', async () => {
    const marker = randomUUID().slice(0, 8)
    const origin = { latitude: 33.75, longitude: -84.35 }
    const visible = await makeListing({ title: `Visible ${marker}`, ...origin })
    const paused = await makeListing({ title: `Paused ${marker}`, ...origin })
    await service.pause(seller, paused.id)
    const archived = await makeListing({ title: `Archived ${marker}`, ...origin })
    await service.archive(seller, archived.id)
    const draft = await service.saveDraft(seller, {
      categoryId: category,
      title: `Draft ${marker}`,
      description: 'Not ready for the map',
      latitude: origin.latitude,
      longitude: origin.longitude
    } as never)
    const suspendedSeller = await makeUser('suspended')
    const suspendedListing = await service.create(suspendedSeller, {
      categoryId: category,
      title: `Suspended ${marker}`,
      description: 'Hidden while the account is suspended',
      neighborhood: 'Inman Park',
      city: 'Atlanta',
      latitude: origin.latitude,
      longitude: origin.longitude
    } as never)
    await prisma.user.update({ where: { id: suspendedSeller }, data: { status: 'SUSPENDED' } })

    const page = await service.list({ ...origin, radiusMiles: 5, query: marker })
    const ids = page.items.map(item => item.id)
    expect(ids).toContain(visible.id)
    expect(ids).not.toContain(paused.id)
    expect(ids).not.toContain(archived.id)
    expect(ids).not.toContain(draft.id)
    expect(ids).not.toContain(suspendedListing.id)

    await service.remove(seller, visible.id)
    await service.remove(seller, paused.id)
    await service.remove(seller, archived.id)
    await service.remove(seller, draft.id)
    await service.remove(suspendedSeller, suspendedListing.id)
  })

  it('returns no distance without an origin', async () => {
    const listing = await makeListing({ title: 'No origin' })
    const page = await service.list({})
    const row = page.items.find(item => item.id === listing.id)
    expect(row?.distanceMiles).toBeNull()
    await service.remove(seller, listing.id)
  })

  it('exposes a coarse location but never the stored coordinates', async () => {
    const listing = await makeListing({ title: 'Privacy check', latitude: 33.7654321, longitude: -84.3567891 })
    const detail = await service.get(listing.id)

    expect(detail).not.toHaveProperty('latitude')
    expect(detail).not.toHaveProperty('longitude')
    expect(detail.hasCoordinates).toBe(true)
    // Rounded to a tenth of a degree, roughly a tenth of a mile.
    expect(detail.approximateLocation).toEqual({ lat: 33.8, lng: -84.4 })
    expect(JSON.stringify(detail)).not.toContain('33.7654321')
    await service.remove(seller, listing.id)
  })

  it('reports no coordinates for a listing that has none', async () => {
    const listing = await makeListing({ title: 'No coords', latitude: undefined, longitude: undefined })
    const detail = await service.get(listing.id)
    expect(detail.hasCoordinates).toBe(false)
    expect(detail.approximateLocation).toBeNull()
    await service.remove(seller, listing.id)
  })

  // -------------------------------------------------------------------- saving

  it('toggles a favorite and cannot create a duplicate', async () => {
    const listing = await makeListing({ title: 'Favorite target' })
    expect(await service.toggleFavorite(other, listing.id)).toEqual({ saved: true })
    expect(await prisma.favorite.count({ where: { userId: other, listingId: listing.id } })).toBe(1)

    // A second call unsaves rather than erroring, and a third re-saves
    // without ever producing a duplicate row.
    expect(await service.toggleFavorite(other, listing.id)).toEqual({ saved: false })
    expect(await service.toggleFavorite(other, listing.id)).toEqual({ saved: true })
    expect(await prisma.favorite.count({ where: { userId: other, listingId: listing.id } })).toBe(1)

    const favorites = await service.listFavorites(other)
    expect(favorites.map(entry => entry.listingId)).toContain(listing.id)
    expect(await service.toggleFavorite(other, listing.id)).toEqual({ saved: false })
    await service.remove(seller, listing.id)
  })

  it('drops an archived listing from the saved list without deleting the save', async () => {
    const listing = await makeListing({ title: 'Saved then archived' })
    await service.toggleFavorite(other, listing.id)
    await service.archive(seller, listing.id)

    const favorites = await service.listFavorites(other)
    expect(favorites.map(entry => entry.listingId)).not.toContain(listing.id)
    // The row survives so re-publishing restores the save.
    expect(await prisma.favorite.count({ where: { userId: other, listingId: listing.id } })).toBe(1)
    await service.remove(seller, listing.id)
  })

  it('scopes saved searches to their owner and supports edit and delete', async () => {
    const mine = await service.saveSearch(seller, { query: 'oak chair', filters: { categoryId: category, maxPriceCents: 5000 } })
    await service.saveSearch(other, { query: 'bicycle', filters: {} })

    const list = await service.listSavedSearches(seller)
    expect(list.map(entry => entry.id)).toContain(mine.id)
    expect(list.map(entry => entry.id)).not.toContain(
      (await service.listSavedSearches(other))[0].id
    )

    const updated = await service.updateSavedSearch(seller, mine.id, { query: 'oak dining chair' })
    expect(updated.query).toBe('oak dining chair')

    // Another member cannot edit or delete it.
    await expect(service.updateSavedSearch(other, mine.id, { query: 'hijacked' })).rejects.toThrow('not found')
    await expect(service.deleteSavedSearch(other, mine.id)).rejects.toThrow('not found')

    await service.deleteSavedSearch(seller, mine.id)
    expect(await service.listSavedSearches(seller)).toHaveLength(0)
  })

  it('rejects a saved search with no query', () => {
    expect(() => service.saveSearch(seller, { query: '   ' })).toThrow('Search query is required')
  })

  // ------------------------------------------------------------------ deletion

  it('removes a listing and keeps dependent history intact', async () => {
    const listing = await makeListing({ title: 'Delete with history' })
    const requestId = randomUUID()
    await prisma.needRequest.create({
      data: {
        id: requestId,
        requesterId: other,
        categoryId: category,
        title: 'Need a chair',
        description: 'Looking for a chair',
        mode: 'BUY',
        status: 'PUBLISHED'
      }
    })
    const offer = await prisma.requestOffer.create({
      data: { requestId, offererId: seller, amountCents: 4500, message: 'I can bring it', status: 'PENDING' }
    })
    await prisma.offerItem.create({ data: { offerId: offer.id, listingId: listing.id } })
    await service.toggleFavorite(other, listing.id)

    const removed = await service.remove(seller, listing.id)
    expect(removed.deleted).toBe(true)

    // The offer still exists and simply no longer references a live listing.
    const reloadedOffer = await prisma.requestOffer.findUniqueOrThrow({
      where: { id: offer.id },
      include: { items: true }
    })
    expect(reloadedOffer.items).toHaveLength(0)
    expect(await prisma.requestOffer.count({ where: { id: offer.id } })).toBe(1)
    // Removal is a soft delete, so the favorite row survives; it simply
    // stops appearing in the saved list because the listing is gone.
    expect(await prisma.favorite.count({ where: { listingId: listing.id } })).toBe(1)
    const favorites = await service.listFavorites(other)
    expect(favorites.map(entry => entry.listingId)).not.toContain(listing.id)
    // And the listing is no longer publicly readable.
    await expect(service.get(listing.id)).rejects.toThrow('Listing not found')
  })

  it('makes a deleted listing reusable only by its owner, not publicly', async () => {
    const listing = await makeListing({ title: 'Gone' })
    await service.remove(seller, listing.id)
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe('DELETED')
    await expect(service.publish(seller, listing.id)).rejects.toThrow('Listing not found')
  })
})
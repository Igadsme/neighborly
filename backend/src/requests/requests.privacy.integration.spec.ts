import { OutboxWriter } from '../events/outbox-writer'
import { RequestLifecycleService } from './request-lifecycle.service'
import { PrismaService } from '../prisma/prisma.service'
import { randomUUID } from 'node:crypto'
import { createOfferFixture, createTestPrisma, INTEGRATION_IDS } from '../common/testing/integration-fixtures'

describe('Request privacy projections against real PostgreSQL', () => {
  let prisma: PrismaService
  let service: RequestLifecycleService

  beforeAll(async () => {
    prisma = createTestPrisma()
    await prisma.$connect()
    service = new RequestLifecycleService(prisma, new OutboxWriter(prisma))
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('hides coordinates and requester identity from anonymous list and detail', async () => {
    await createOfferFixture(prisma)

    // A request of this suite's own, because the shared fixture request may
    // already have been fulfilled by the acceptance suite that runs against
    // the same rows, and the public feed deliberately shows only live ones.
    const category = randomUUID()
    await prisma.category.create({
      data: { id: category, name: `Privacy ${category.slice(0, 8)}`, slug: `privacy-${category}` }
    })
    const own = await service.create(
      INTEGRATION_IDS.requester,
      {
        categoryId: category,
        title: 'Need a desk',
        description: 'Looking for a small writing desk nearby',
        mode: 'BUY',
        latitude: 33.75,
        longitude: -84.35,
        neighborhood: 'Inman Park'
      } as never,
      true
    )

    const listed = (await service.list({ categoryId: category, limit: 100 })).items
    const published = listed.find(row => row.id === own.id)
    expect(published).toBeDefined()
    expect(published).not.toHaveProperty('latitude')
    expect(published).not.toHaveProperty('longitude')
    expect(published).not.toHaveProperty('requesterId')
    expect(published!.title).toBe('Need a desk')

    const detail = await service.get(own.id)
    expect(detail).not.toHaveProperty('latitude')
    expect(detail).not.toHaveProperty('longitude')
    expect(detail).not.toHaveProperty('requesterId')
    // Offers moved off the public projection entirely: embedding them would
    // show every competing provider's price to any anonymous reader.
    expect(detail).not.toHaveProperty('offers')
  })

  it('exposes coordinates only to the verified requester', async () => {
    await createOfferFixture(prisma)

    const ownerView = await service.getForOwner(INTEGRATION_IDS.requester, INTEGRATION_IDS.request)
    // Even the owner reads a coarse location; the exact coordinates are used
    // for radius filtering and are never serialized to a client.
    expect(ownerView).not.toHaveProperty('latitude')
    expect(ownerView).not.toHaveProperty('longitude')
    expect(ownerView.approximateLocation).toBeTruthy()
    expect(ownerView.coordinatesShared).toBe(true)

    const strangerView = await service.get(INTEGRATION_IDS.request, INTEGRATION_IDS.outsider)
    expect(strangerView).not.toHaveProperty('latitude')
    expect(strangerView).not.toHaveProperty('longitude')
    expect(strangerView).not.toHaveProperty('requesterId')
  })

  it('does not leak coordinates through nested offer payloads', async () => {
    await createOfferFixture(prisma)

    const detail = await service.get(INTEGRATION_IDS.request)
    const serialized = JSON.stringify(detail)
    expect(serialized).not.toContain('latitude')
    expect(serialized).not.toContain('longitude')
    expect(serialized).not.toContain('requesterId')
    expect(serialized).not.toContain('passwordHash')
  })
})

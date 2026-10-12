import { OutboxWriter } from '../events/outbox-writer'
import { RequestLifecycleService } from './request-lifecycle.service'
import { PrismaService } from '../prisma/prisma.service'
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

    // Filtered by this fixture's category: the shared database holds requests
    // from every other suite, so an unfiltered first page is not ours.
    const listed = (await service.list({ categoryId: INTEGRATION_IDS.category, limit: 100 })).items
    const published = listed.find(row => row.id === INTEGRATION_IDS.request)
    expect(published).toBeDefined()
    expect(published).not.toHaveProperty('latitude')
    expect(published).not.toHaveProperty('longitude')
    expect(published).not.toHaveProperty('requesterId')
    expect(published!.title).toBe('Need a desk')
    expect(published!.requester.profile?.firstName).toBe('Req')

    const detail = await service.get(INTEGRATION_IDS.request)
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

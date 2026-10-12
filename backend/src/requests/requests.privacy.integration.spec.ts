import { RequestsService } from './requests.service'
import { PrismaService } from '../prisma/prisma.service'
import { createOfferFixture, createTestPrisma, INTEGRATION_IDS } from '../common/testing/integration-fixtures'

describe('Request privacy projections against real PostgreSQL', () => {
  let prisma: PrismaService
  let service: RequestsService

  beforeAll(async () => {
    prisma = createTestPrisma()
    await prisma.$connect()
    service = new RequestsService(prisma)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('hides coordinates and requester identity from anonymous list and detail', async () => {
    await createOfferFixture(prisma)

    const listed = await service.list()
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
    expect(detail.offers[0].offerer.profile?.firstName).toBe('Off')
  })

  it('exposes coordinates only to the verified requester', async () => {
    await createOfferFixture(prisma)

    const ownerView = (await service.get(INTEGRATION_IDS.request, INTEGRATION_IDS.requester)) as unknown as {
      latitude?: unknown
      longitude?: unknown
      requesterId?: string
    }
    expect(ownerView.latitude).toBeTruthy()
    expect(ownerView.longitude).toBeTruthy()
    expect(ownerView.requesterId).toBe(INTEGRATION_IDS.requester)

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

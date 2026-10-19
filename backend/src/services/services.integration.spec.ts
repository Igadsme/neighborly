import { randomUUID } from 'node:crypto'
import { ForbiddenException } from '@nestjs/common'
import { ServicesService } from './services.service'
import { PrismaService } from '../prisma/prisma.service'
import { createTestPrisma } from '../common/testing/integration-fixtures'

const PASSWORD_HASH = '$argon2id$stub'

describe('Services against real PostgreSQL', () => {
  let prisma: PrismaService
  let service: ServicesService
  let owner: string
  let other: string

  beforeAll(async () => {
    prisma = createTestPrisma()
    await prisma.$connect()
    service = new ServicesService(prisma)
    owner = await makeUser('service-owner')
    other = await makeUser('service-other')
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  async function makeUser(prefix: string) {
    const id = randomUUID()
    await prisma.user.create({ data: { id, email: `${prefix}-${id}@example.com`, passwordHash: PASSWORD_HASH } })
    await prisma.profile.create({ data: { userId: id, firstName: 'Test', lastName: 'User' } })
    return id
  }

  const input = {
    title: 'House Cleaning',
    businessName: "Rosa's Spotless Cleaning",
    description: 'Deep cleans, move-out cleans, and weekly upkeep.',
    category: 'Cleaning' as const,
    startingPriceCents: 8900,
    location: 'Decatur',
    availability: 'Mon-Sat',
    latitude: 33.77,
    longitude: -84.3
  }

  it('creates a service and returns it from the public read', async () => {
    const created = await service.create(owner, input)
    const loaded = await service.get(created.id)
    expect(loaded.title).toBe(input.title)
    expect(loaded.businessName).toBe(input.businessName)
    expect(loaded).not.toHaveProperty('latitude')
    await service.archive(owner, created.id)
  })

  it('rejects an update from someone who does not own the service', async () => {
    const created = await service.create(owner, { ...input, title: 'Owner only cleaning' })
    await expect(service.update(other, created.id, { title: 'Taken over' })).rejects.toBeInstanceOf(ForbiddenException)
    expect((await service.get(created.id)).title).toBe('Owner only cleaning')
    await service.archive(owner, created.id)
  })

  it('ignores the stored rating column and returns null with reviewCount 0 when there are no reviews', async () => {
    const quiet = await makeUser('service-quiet')
    const created = await service.create(quiet, { ...input, title: 'Unreviewed cleaning' })
    await prisma.serviceListing.update({
      where: { id: created.id },
      data: { rating: 4.9, reviewCount: 142 }
    })
    const loaded = await service.get(created.id)
    expect(loaded.rating).toBeNull()
    expect(loaded.reviewCount).toBe(0)
    expect(loaded.rating).not.toBe(0)
    expect(JSON.stringify(loaded)).not.toContain('4.9')
    await service.archive(quiet, created.id)
  })

  it('returns the published review average and skips pending and hidden reviews', async () => {
    const ratedOwner = await makeUser('service-rated')
    const created = await service.create(ratedOwner, { ...input, title: 'Reviewed cleaning' })
    const publishedA = await prisma.transaction.create({ data: { status: 'COMPLETED' } })
    const publishedB = await prisma.transaction.create({ data: { status: 'COMPLETED' } })
    const pending = await prisma.transaction.create({ data: { status: 'COMPLETED' } })
    const hidden = await prisma.transaction.create({ data: { status: 'COMPLETED' } })
    await prisma.review.create({
      data: { transactionId: publishedA.id, authorId: other, subjectId: ratedOwner, rating: 5, body: 'The apartment was spotless.', status: 'PUBLISHED' }
    })
    await prisma.review.create({
      data: { transactionId: publishedB.id, authorId: other, subjectId: ratedOwner, rating: 4, body: 'On time and careful with the floors.', status: 'PUBLISHED' }
    })
    await prisma.review.create({
      data: { transactionId: pending.id, authorId: other, subjectId: ratedOwner, rating: 1, body: 'Still waiting on the other side.', status: 'PENDING' }
    })
    await prisma.review.create({
      data: {
        transactionId: hidden.id,
        authorId: other,
        subjectId: ratedOwner,
        rating: 1,
        body: 'Hidden by a moderator.',
        status: 'PUBLISHED',
        hiddenAt: new Date()
      }
    })

    const loaded = await service.get(created.id)
    expect(loaded.rating).toBe(4.5)
    expect(loaded.reviewCount).toBe(2)
    expect(loaded.rating).not.toBe(0)
    await service.archive(ratedOwner, created.id)
  })
})

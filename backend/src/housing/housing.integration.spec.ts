import { randomUUID } from 'node:crypto'
import { ForbiddenException } from '@nestjs/common'
import { HousingService } from './housing.service'
import { PrismaService } from '../prisma/prisma.service'
import { createTestPrisma } from '../common/testing/integration-fixtures'

const PASSWORD_HASH = '$argon2id$stub'

describe('Housing against real PostgreSQL', () => {
  let prisma: PrismaService
  let service: HousingService
  let owner: string
  let other: string

  beforeAll(async () => {
    prisma = createTestPrisma()
    await prisma.$connect()
    service = new HousingService(prisma)
    owner = await makeUser('housing-owner')
    other = await makeUser('housing-other')
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
    title: 'Sunny 2BR in Inman Park',
    description: 'Bright two-bedroom a short walk from the BeltLine.',
    type: 'Apartment' as const,
    listingType: 'rent' as const,
    priceCents: 185000,
    beds: 2,
    baths: 1,
    neighborhood: 'Inman Park',
    city: 'Atlanta',
    latitude: 33.761,
    longitude: -84.363
  }

  it('creates a housing listing and returns it from the public read', async () => {
    const created = await service.create(owner, input)
    const loaded = await service.get(created.id)
    expect(loaded.title).toBe(input.title)
    expect(loaded.rating).toBeNull()
    expect(loaded.reviewCount).toBe(0)
    expect(loaded).not.toHaveProperty('latitude')
    await service.archive(owner, created.id)
  })

  it('rejects an update from someone who does not own the listing', async () => {
    const created = await service.create(owner, { ...input, title: 'Owner only flat' })
    await expect(service.update(other, created.id, { title: 'Taken over' })).rejects.toBeInstanceOf(ForbiddenException)
    expect((await service.get(created.id)).title).toBe('Owner only flat')
    await service.archive(owner, created.id)
  })

  it('exposes the owner review aggregate and never a zero score', async () => {
    const ratedOwner = await makeUser('housing-rated')
    const created = await service.create(ratedOwner, { ...input, title: 'Rated flat' })
    const empty = await service.get(created.id)
    expect(empty.rating).toBeNull()
    expect(empty.reviewCount).toBe(0)

    const first = await prisma.transaction.create({ data: { status: 'COMPLETED' } })
    const second = await prisma.transaction.create({ data: { status: 'COMPLETED' } })
    const ignored = await prisma.transaction.create({ data: { status: 'COMPLETED' } })
    await prisma.review.create({
      data: { transactionId: first.id, authorId: other, subjectId: ratedOwner, rating: 5, body: 'Quiet building and a fair landlord.', status: 'PUBLISHED' }
    })
    await prisma.review.create({
      data: { transactionId: second.id, authorId: other, subjectId: ratedOwner, rating: 4, body: 'Helpful replies throughout the lease.', status: 'PUBLISHED' }
    })
    await prisma.review.create({
      data: { transactionId: ignored.id, authorId: other, subjectId: ratedOwner, rating: 1, body: 'This review is still pending.', status: 'PENDING' }
    })

    const loaded = await service.get(created.id)
    expect(loaded.rating).toBe(4.5)
    expect(loaded.reviewCount).toBe(2)
    expect(loaded.rating).not.toBe(0)
    await service.archive(ratedOwner, created.id)
  })
})

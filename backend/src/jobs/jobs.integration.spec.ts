import { randomUUID } from 'node:crypto'
import { ForbiddenException } from '@nestjs/common'
import { JobsService } from './jobs.service'
import { PrismaService } from '../prisma/prisma.service'
import { createTestPrisma } from '../common/testing/integration-fixtures'

const PASSWORD_HASH = '$argon2id$stub'

describe('Jobs against real PostgreSQL', () => {
  let prisma: PrismaService
  let service: JobsService
  let owner: string
  let other: string

  beforeAll(async () => {
    prisma = createTestPrisma()
    await prisma.$connect()
    service = new JobsService(prisma)
    owner = await makeUser('job-owner')
    other = await makeUser('job-other')
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
    title: 'Full-Stack Engineer',
    company: 'PeachTech Solutions',
    description: 'Build product features with a small Atlanta team.',
    type: 'Full-time' as const,
    level: 'Mid-Senior',
    salary: '$110k',
    location: 'Midtown Atlanta',
    remote: 'Hybrid' as const,
    latitude: 33.78,
    longitude: -84.38
  }

  it('creates a job and returns it from the public read', async () => {
    const created = await service.create(owner, input)
    const loaded = await service.get(created.id)
    expect(loaded.title).toBe(input.title)
    expect(loaded.company).toBe(input.company)
    expect(loaded).not.toHaveProperty('latitude')
    await service.archive(owner, created.id)
  })

  it('rejects an update from someone who does not own the job', async () => {
    const created = await service.create(owner, { ...input, title: 'Owner only role' })
    await expect(service.update(other, created.id, { title: 'Taken over' })).rejects.toBeInstanceOf(ForbiddenException)
    expect((await service.get(created.id)).title).toBe('Owner only role')
    await service.archive(owner, created.id)
  })
})

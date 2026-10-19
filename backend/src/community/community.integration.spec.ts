import { randomUUID } from 'node:crypto'
import { ForbiddenException } from '@nestjs/common'
import { CommunityService } from './community.service'
import { PrismaService } from '../prisma/prisma.service'
import { createTestPrisma } from '../common/testing/integration-fixtures'

const PASSWORD_HASH = '$argon2id$stub'

describe('Community against real PostgreSQL', () => {
  let prisma: PrismaService
  let service: CommunityService
  let author: string
  let other: string

  beforeAll(async () => {
    prisma = createTestPrisma()
    await prisma.$connect()
    service = new CommunityService(prisma)
    author = await makeUser('post-author')
    other = await makeUser('post-other')
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
    type: 'discussion' as const,
    title: 'BeltLine cleanup Saturday',
    body: 'Meet at the south lot and bring gloves if you have them.',
    neighborhood: 'Inman Park',
    city: 'Atlanta'
  }

  it('creates a post and returns it from the public read', async () => {
    const created = await service.createPost(author, input)
    const loaded = await service.getPost(created.id)
    expect(loaded.title).toBe(input.title)
    expect(loaded.body).toBe(input.body)
  })

  it('rejects an update from someone who did not write the post', async () => {
    const created = await service.createPost(author, { ...input, title: 'Author only thread' })
    await expect(service.updatePost(other, created.id, { title: 'Taken over' })).rejects.toBeInstanceOf(ForbiddenException)
    expect((await service.getPost(created.id)).title).toBe('Author only thread')
  })
})

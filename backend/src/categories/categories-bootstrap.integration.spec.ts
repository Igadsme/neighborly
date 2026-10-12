import { bootstrapCategories, categoryNames } from '../../prisma/bootstrap'
import { PrismaService } from '../prisma/prisma.service'
import { createTestPrisma } from '../common/testing/integration-fixtures'

describe('Production category bootstrap against real PostgreSQL', () => {
  let prisma: PrismaService

  beforeAll(async () => {
    prisma = createTestPrisma()
    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('creates the reference categories on a clean database', async () => {
    await bootstrapCategories(prisma)

    const rows = await prisma.category.findMany({
      where: { name: { in: categoryNames } }
    })
    expect(rows).toHaveLength(categoryNames.length)
    for (const row of rows) {
      expect(row.slug).toBe(row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''))
    }
  })

  it('is idempotent and preserves existing identifiers', async () => {
    const before = await prisma.category.findMany({ where: { name: { in: categoryNames } } })
    expect(before).toHaveLength(categoryNames.length)

    await bootstrapCategories(prisma)
    await bootstrapCategories(prisma)

    const after = await prisma.category.findMany({ where: { name: { in: categoryNames } } })
    expect(after).toHaveLength(categoryNames.length)
    expect(after.map(row => row.id).sort()).toEqual(before.map(row => row.id).sort())
  })

  it('leaves user-created categories untouched', async () => {
    const custom = await prisma.category.create({
      data: { id: 'a0000000-0000-4000-8000-000000000001', name: 'Integration Custom', slug: 'integration-custom' }
    })

    await bootstrapCategories(prisma)

    const reloaded = await prisma.category.findUniqueOrThrow({ where: { id: custom.id } })
    expect(reloaded.name).toBe('Integration Custom')
    const all = await prisma.category.findMany()
    expect(all).toHaveLength(categoryNames.length + 1)
  })
})

import { CategoriesController } from './categories.controller'
import { CategoriesService } from './categories.service'
import { bootApi } from '../common/testing/http-app'

describe('Categories HTTP', () => {
  let query: { select?: unknown; orderBy?: unknown } | undefined
  const prisma = {
    category: {
      findMany: jest.fn(async (args: { select?: unknown; orderBy?: unknown }) => {
        query = args
        return [
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Furniture',
            slug: 'furniture',
            _count: { listings: 4 }
          },
          {
            id: '22222222-2222-4222-8222-222222222222',
            name: 'Housing',
            slug: 'housing',
            _count: { listings: 0 }
          }
        ]
      })
    }
  }

  let baseUrl = ''
  let app: { close: () => Promise<void> }

  beforeAll(async () => {
    const booted = await bootApi({ controller: CategoriesController, service: CategoriesService, prisma })
    app = booted.app
    baseUrl = booted.baseUrl
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /api/v1/categories returns names and published listing counts', async () => {
    const response = await fetch(`${baseUrl}/api/v1/categories`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      { id: '11111111-1111-4111-8111-111111111111', name: 'Furniture', slug: 'furniture', listingCount: 4 },
      { id: '22222222-2222-4222-8222-222222222222', name: 'Housing', slug: 'housing', listingCount: 0 }
    ])
    expect(query?.orderBy).toEqual({ name: 'asc' })
    expect(query?.select).toMatchObject({
      id: true,
      name: true,
      slug: true,
      _count: { select: { listings: { where: { status: 'PUBLISHED', deletedAt: null } } } }
    })
  })
})

import { ListingsController } from './listings.controller'
import { ListingsService } from './listings.service'
import { bootApi } from '../common/testing/http-app'

const categoryId = '11111111-1111-4111-8111-111111111111'

const listingBody = {
  categoryId,
  title: 'Oak chair',
  description: 'Solid oak dining chair',
  priceCents: 48000,
  condition: 'Good',
  pickupAvailable: true,
  deliveryAvailable: false
}

describe('Listing draft HTTP', () => {
  let sellerId = 'user-1'
  let stored: Record<string, unknown> | null = null
  let created: { data?: Record<string, unknown> } | undefined
  const prisma = {
    listing: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        created = args
        stored = { id: 'listing-1', deletedAt: null, ...args.data }
        return stored
      }),
      findUnique: jest.fn(async () => stored),
      findFirst: jest.fn(async (args: { where: { id: string; status?: { not?: string } } }) => {
        if (!stored || stored.id !== args.where.id || stored.deletedAt) return null
        if (args.where.status?.not === 'DRAFT' && stored.status === 'DRAFT') return null
        return stored
      }),
      update: jest.fn(async (args: { data: Record<string, unknown> }) => {
        stored = { ...stored, ...args.data }
        return stored
      })
    },
    savedSearch: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'search-1', ...args.data }))
    }
  }

  let baseUrl = ''
  let token = ''
  let app: { close: () => Promise<void> }

  beforeAll(async () => {
    const booted = await bootApi({ controller: ListingsController, service: ListingsService, prisma, userId: 'user-1' })
    app = booted.app
    baseUrl = booted.baseUrl
    token = booted.token
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    sellerId = 'user-1'
    stored = null
    created = undefined
    jest.clearAllMocks()
  })

  it('POST /api/v1/listings creates a published listing and rejects a short description', async () => {
    const response = await fetch(`${baseUrl}/api/v1/listings`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(listingBody)
    })
    expect(response.status).toBe(201)
    expect(created?.data).toMatchObject({ sellerId: 'user-1', status: 'PUBLISHED', priceCents: 48000, condition: 'Good' })
    expect((await response.json()) as { status: string }).toMatchObject({ status: 'PUBLISHED' })

    stored = null
    const invalid = await fetch(`${baseUrl}/api/v1/listings`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ...listingBody, description: 'too short' })
    })
    expect(invalid.status).toBe(400)
    expect(prisma.listing.create).toHaveBeenCalledTimes(1)
  })

  it('POST /api/v1/listings/drafts saves DRAFT and stays off the public get', async () => {
    const response = await fetch(`${baseUrl}/api/v1/listings/drafts`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(listingBody)
    })
    expect(response.status).toBe(201)
    expect(created?.data?.status).toBe('DRAFT')

    const hidden = await fetch(`${baseUrl}/api/v1/listings/listing-1`)
    expect(hidden.status).toBe(404)
  })

  it('POST /api/v1/listings/drafts without a token is 401', async () => {
    const response = await fetch(`${baseUrl}/api/v1/listings/drafts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(listingBody)
    })
    expect(response.status).toBe(401)
    expect(prisma.listing.create).not.toHaveBeenCalled()
  })

  it('POST /api/v1/listings/:id/publish turns the owner draft into PUBLISHED', async () => {
    stored = { id: 'listing-1', sellerId, deletedAt: null, status: 'DRAFT', title: 'Oak chair', description: 'Solid oak dining chair' }
    const response = await fetch(`${baseUrl}/api/v1/listings/listing-1/publish`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` }
    })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ id: 'listing-1', status: 'PUBLISHED' })
  })

  it('POST /api/v1/listings/:id/publish by someone else is 403', async () => {
    stored = { id: 'listing-1', sellerId: 'someone-else', deletedAt: null, status: 'DRAFT', title: 'Oak chair', description: 'Solid oak dining chair' }
    const response = await fetch(`${baseUrl}/api/v1/listings/listing-1/publish`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` }
    })
    expect(response.status).toBe(403)
    expect(prisma.listing.update).not.toHaveBeenCalled()
  })

  it('POST /api/v1/listings/:id/publish rejects a sold listing', async () => {
    stored = { id: 'listing-1', sellerId, deletedAt: null, status: 'SOLD', title: 'Oak chair', description: 'Solid oak dining chair' }
    const response = await fetch(`${baseUrl}/api/v1/listings/listing-1/publish`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` }
    })
    expect(response.status).toBe(409)
    expect(prisma.listing.update).not.toHaveBeenCalled()
  })

  it('POST /api/v1/listings/saved-searches keeps the filter object the Explore screen sends', async () => {
    const response = await fetch(`${baseUrl}/api/v1/listings/saved-searches`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        query: 'walnut table',
        filters: { category: 'Furniture', verifiedOnly: true, maxPrice: '400' }
      })
    })
    expect(response.status).toBe(201)
    expect(prisma.savedSearch.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'user-1',
        query: 'walnut table',
        filters: { category: 'Furniture', verifiedOnly: true, maxPrice: '400' }
      })
    }))
  })
})

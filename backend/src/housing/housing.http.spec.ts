import { HousingController } from './housing.controller'
import { HousingService } from './housing.service'
import { bootApi } from '../common/testing/http-app'
import { projectSelect, SelectSpec } from '../common/testing/project-prisma'

const owner = {
  id: 'owner-1',
  email: 'secret-owner@example.com',
  passwordHash: 'secret-hash-value',
  status: 'ACTIVE',
  profile: {
    displayName: 'Ada L',
    firstName: 'Ada',
    lastName: 'Lovelace',
    bio: 'Private bio',
    neighborhood: 'Inman Park',
    city: 'Atlanta',
    state: 'GA',
    latitude: '33.770001',
    longitude: '-84.370001'
  }
}

const housing = {
  id: 'housing-1',
  ownerId: 'owner-1',
  title: 'Sunny 2BR in Inman Park',
  description: 'Bright two-bedroom a short walk from the BeltLine.',
  propertyType: 'Apartment',
  listingType: 'rent',
  priceCents: 185000,
  priceUnit: '/mo',
  beds: 2,
  baths: 1,
  sqft: 920,
  neighborhood: 'Inman Park',
  city: 'Atlanta',
  available: 'Oct 1, 2026',
  lease: '12 months',
  pets: true,
  furnished: false,
  utilities: 'Water included',
  verified: true,
  status: 'PUBLISHED',
  latitude: '33.761111',
  longitude: '-84.363333',
  createdAt: new Date('2026-09-22T12:00:00.000Z'),
  updatedAt: new Date('2026-09-22T12:00:00.000Z'),
  deletedAt: null,
  owner,
  images: [{ id: 'image-1', objectKey: 'photo-1560448204-e02f11c3d0e2', sortOrder: 0 }]
}

function expectPublic(body: unknown) {
  const row = body as { type?: string; owner?: unknown; latitude?: unknown; longitude?: unknown }
  expect(row.type).toBe('Apartment')
  expect(row.owner).toEqual({
    id: 'owner-1',
    profile: { displayName: 'Ada L', firstName: 'Ada', neighborhood: 'Inman Park', city: 'Atlanta' }
  })
  expect(row.latitude).toBeUndefined()
  expect(row.longitude).toBeUndefined()
  const serialized = JSON.stringify(body)
  for (const secret of ['secret-owner@example.com', 'secret-hash-value', 'Lovelace', 'Private bio', '33.761111', '-84.363333', '33.770001', '-84.370001', 'passwordHash']) {
    expect(serialized).not.toContain(secret)
  }
}

describe('Housing HTTP', () => {
  let ownerId = 'user-1'
  let listWhere: unknown
  let created: { data?: Record<string, unknown> } | undefined
  const prisma = {
    housingListing: {
      findMany: jest.fn(async (args: { select: SelectSpec; where: unknown }) => {
        listWhere = args.where
        return [projectSelect(housing, args.select)]
      }),
      findFirst: jest.fn(async (args: { select: SelectSpec }) => projectSelect(housing, args.select)),
      findUnique: jest.fn(async () => ({ ownerId, deletedAt: null })),
      create: jest.fn(async (args: { data: Record<string, unknown>; select: SelectSpec }) => {
        created = args
        return projectSelect({ ...housing, ...args.data, owner, images: housing.images, verified: false }, args.select)
      }),
      update: jest.fn(async () => housing)
    },
    housingImage: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      createMany: jest.fn(async () => ({ count: 0 }))
    }
  }

  let baseUrl = ''
  let token = ''
  let app: { close: () => Promise<void> }

  beforeAll(async () => {
    const booted = await bootApi({ controller: HousingController, service: HousingService, prisma })
    app = booted.app
    baseUrl = booted.baseUrl
    token = booted.token
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    ownerId = 'user-1'
    created = undefined
    jest.clearAllMocks()
  })

  it('GET /api/v1/housing returns the public owner card and hides coordinates', async () => {
    const response = await fetch(`${baseUrl}/api/v1/housing`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as unknown[]
    expect(body).toHaveLength(1)
    expectPublic(body[0])
  })

  it('GET /api/v1/housing applies the screen filters', async () => {
    const response = await fetch(`${baseUrl}/api/v1/housing?listingType=rent&pets=true&minBeds=2&maxPriceCents=200000&type=Apartment`)
    expect(response.status).toBe(200)
    expect(listWhere).toMatchObject({
      listingType: 'rent',
      pets: true,
      propertyType: 'Apartment',
      beds: { gte: 2 },
      priceCents: { lte: 200000 },
      status: 'PUBLISHED',
      deletedAt: null
    })
  })

  it('GET /api/v1/housing/:id returns the public owner card and hides coordinates', async () => {
    const response = await fetch(`${baseUrl}/api/v1/housing/housing-1`)
    expect(response.status).toBe(200)
    expectPublic(await response.json())
  })

  it('POST /api/v1/housing without a token is 401', async () => {
    const response = await fetch(`${baseUrl}/api/v1/housing`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Sunny flat' })
    })
    expect(response.status).toBe(401)
    expect(prisma.housingListing.create).not.toHaveBeenCalled()
  })

  it('POST /api/v1/housing stores coordinates and does not return them', async () => {
    const response = await fetch(`${baseUrl}/api/v1/housing`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Sunny 2BR in Inman Park',
        description: 'Bright two-bedroom a short walk from the BeltLine.',
        type: 'Apartment',
        listingType: 'rent',
        priceCents: 185000,
        priceUnit: '/mo',
        beds: 2,
        baths: 1,
        sqft: 920,
        neighborhood: 'Inman Park',
        city: 'Atlanta',
        available: 'Oct 1, 2026',
        pets: true,
        latitude: 33.761111,
        longitude: -84.363333
      })
    })
    expect(response.status).toBe(201)
    expect(created?.data).toMatchObject({ ownerId: 'user-1', propertyType: 'Apartment', latitude: 33.761111, longitude: -84.363333 })
    expect(created?.data?.verified).toBeUndefined()
    expectPublic(await response.json())
  })

  it('PATCH /api/v1/housing/:id by someone else is 403', async () => {
    ownerId = 'someone-else'
    const response = await fetch(`${baseUrl}/api/v1/housing/housing-1`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Taken over' })
    })
    expect(response.status).toBe(403)
    expect(prisma.housingListing.update).not.toHaveBeenCalled()
  })

  it('DELETE /api/v1/housing/:id without a token is 401', async () => {
    const response = await fetch(`${baseUrl}/api/v1/housing/housing-1`, { method: 'DELETE' })
    expect(response.status).toBe(401)
    expect(prisma.housingListing.update).not.toHaveBeenCalled()
  })

  it('DELETE /api/v1/housing/:id by the owner archives the row', async () => {
    const response = await fetch(`${baseUrl}/api/v1/housing/housing-1`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` }
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: 'housing-1', status: 'ARCHIVED' })
  })
})

import { ServicesController } from './services.controller'
import { ServicesService } from './services.service'
import { bootApi } from '../common/testing/http-app'
import { projectSelect, SelectSpec } from '../common/testing/project-prisma'

const requester = {
  id: 'user-1',
  email: 'secret-requester@example.com',
  passwordHash: 'requester-hash',
  profile: {
    displayName: 'Grace H',
    firstName: 'Grace',
    lastName: 'Hopper',
    neighborhood: 'Midtown',
    city: 'Atlanta',
    latitude: '40.712800',
    longitude: '-74.006000'
  }
}

const quote = {
  id: 'quote-1',
  serviceId: 'service-1',
  requesterId: 'user-1',
  preferredDate: '2026-10-01',
  preferredTime: '10:00 AM',
  notes: 'Deep clean before move-in',
  address: 'SECRET-ADDRESS-9',
  status: 'PENDING',
  createdAt: new Date('2026-09-23T12:00:00.000Z'),
  updatedAt: new Date('2026-09-23T12:00:00.000Z'),
  requester
}

const service = {
  id: 'service-1',
  ownerId: 'provider-1',
  title: 'House Cleaning',
  businessName: "Rosa's Spotless Cleaning",
  description: 'Deep cleans, move-out cleans, and weekly upkeep.',
  category: 'Cleaning',
  startingPriceCents: 8900,
  location: 'Decatur & Surrounding',
  availability: 'Mon–Sat',
  tags: ['Deep Clean', 'Weekly'],
  imageKey: 'photo-1527515545081-5db817172677',
  backgroundCheck: true,
  rating: 4.9,
  reviewCount: 142,
  status: 'PUBLISHED',
  latitude: '33.900001',
  longitude: '-84.400001',
  createdAt: new Date('2026-09-20T12:00:00.000Z'),
  updatedAt: new Date('2026-09-20T12:00:00.000Z'),
  deletedAt: null,
  owner: {
    id: 'provider-1',
    email: 'secret-provider@example.com',
    passwordHash: 'provider-hash',
    profile: {
      displayName: 'Rosa M',
      firstName: 'Rosa',
      lastName: 'Mendez',
      neighborhood: 'Decatur',
      city: 'Atlanta',
      latitude: '33.910001',
      longitude: '-84.410001'
    }
  },
  quotes: [quote]
}

function expectPublicService(body: unknown) {
  const row = body as { image?: string; startingPriceCents?: number; quotes?: unknown; latitude?: unknown; rating?: number }
  expect(row.image).toBe('photo-1527515545081-5db817172677')
  expect(row.startingPriceCents).toBe(8900)
  expect(row.rating).toBe(4.9)
  expect(row.quotes).toBeUndefined()
  expect(row.latitude).toBeUndefined()
  const serialized = JSON.stringify(body)
  for (const secret of ['SECRET-ADDRESS-9', 'secret-provider@example.com', 'provider-hash', 'secret-requester@example.com', 'requester-hash', 'Mendez', 'Hopper', '33.900001', '-84.400001', '33.910001', '40.712800', 'passwordHash']) {
    expect(serialized).not.toContain(secret)
  }
}

describe('Services HTTP', () => {
  let serviceOwnerId = 'provider-1'
  const prisma = {
    serviceListing: {
      findMany: jest.fn(async (args: { select: SelectSpec }) => [projectSelect(service, args.select)]),
      findFirst: jest.fn(async (args: { select?: SelectSpec }) => {
        if (args.select && 'ownerId' in args.select && !('title' in args.select)) return { ownerId: serviceOwnerId }
        return args.select ? projectSelect(service, args.select) : service
      }),
      findUnique: jest.fn(async () => ({ ownerId: serviceOwnerId, deletedAt: null })),
      create: jest.fn(async (args: { data: Record<string, unknown>; select: SelectSpec }) =>
        projectSelect({ ...service, ...args.data, owner: service.owner, quotes: [] }, args.select)
      ),
      update: jest.fn(async () => service)
    },
    serviceQuote: {
      create: jest.fn(async (args: { data: Record<string, unknown>; select: SelectSpec }) => {
        Object.assign(quote, args.data, { status: 'PENDING' })
        return projectSelect(quote, args.select)
      }),
      findMany: jest.fn(async (args: { select: SelectSpec }) => [projectSelect(quote, args.select)]),
      findUnique: jest.fn(async (args: { select: SelectSpec }) =>
        projectSelect(
          { ...quote, service: { ownerId: 'provider-1', deletedAt: null, status: 'PUBLISHED', email: 'secret-provider@example.com' } },
          args.select
        )
      ),
      update: jest.fn(async (args: { data: Record<string, unknown>; select: SelectSpec }) => {
        Object.assign(quote, args.data)
        return projectSelect(quote, args.select)
      })
    }
  }

  let baseUrl = ''
  let token = ''
  let tokenFor: (userId: string, email?: string) => string = () => ''
  let app: { close: () => Promise<void> }

  beforeAll(async () => {
    const booted = await bootApi({ controller: ServicesController, service: ServicesService, prisma })
    app = booted.app
    baseUrl = booted.baseUrl
    token = booted.token
    tokenFor = booted.tokenFor
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    serviceOwnerId = 'provider-1'
    quote.status = 'PENDING'
    quote.address = 'SECRET-ADDRESS-9'
    jest.clearAllMocks()
  })

  it('GET /api/v1/services hides quote addresses and provider secrets', async () => {
    const response = await fetch(`${baseUrl}/api/v1/services`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as unknown[]
    expectPublicService(body[0])
  })

  it('GET /api/v1/services/:id hides quote addresses and provider secrets', async () => {
    const response = await fetch(`${baseUrl}/api/v1/services/service-1`)
    expect(response.status).toBe(200)
    expectPublicService(await response.json())
  })

  it('POST /api/v1/services without a token is 401', async () => {
    const response = await fetch(`${baseUrl}/api/v1/services`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    expect(response.status).toBe(401)
    expect(prisma.serviceListing.create).not.toHaveBeenCalled()
  })

  it('POST /api/v1/services/:id/quotes without a token is 401', async () => {
    const response = await fetch(`${baseUrl}/api/v1/services/service-1/quotes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notes: 'Need a deep clean' })
    })
    expect(response.status).toBe(401)
    expect(prisma.serviceQuote.create).not.toHaveBeenCalled()
  })

  it('POST /api/v1/services/:id/quotes rejects the provider quoting themselves', async () => {
    serviceOwnerId = 'user-1'
    const response = await fetch(`${baseUrl}/api/v1/services/service-1/quotes`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ notes: 'Need a deep clean', address: 'SECRET-ADDRESS-9' })
    })
    expect(response.status).toBe(400)
    expect(prisma.serviceQuote.create).not.toHaveBeenCalled()
  })

  it('keeps the street address off the provider quote list until the provider accepts', async () => {
    const provider = tokenFor('provider-1', 'provider@example.com')
    const hidden = await fetch(`${baseUrl}/api/v1/services/service-1/quotes`, { headers: { authorization: `Bearer ${provider}` } })
    expect(hidden.status).toBe(200)
    const hiddenBody = await hidden.json()
    expect(JSON.stringify(hiddenBody)).not.toContain('SECRET-ADDRESS-9')
    expect(JSON.stringify(hiddenBody)).not.toContain('secret-requester@example.com')
    expect(JSON.stringify(hiddenBody)).not.toContain('Hopper')

    const outsider = await fetch(`${baseUrl}/api/v1/services/service-1/quotes`, { headers: { authorization: `Bearer ${token}` } })
    expect(outsider.status).toBe(403)
    expect(JSON.stringify(await outsider.json())).not.toContain('SECRET-ADDRESS-9')

    const accepted = await fetch(`${baseUrl}/api/v1/services/quotes/quote-1/accept`, { method: 'POST', headers: { authorization: `Bearer ${provider}` } })
    expect(accepted.status).toBe(201)
    const acceptedBody = (await accepted.json()) as { address?: string; requester?: { profile?: { lastName?: string } } }
    expect(acceptedBody.address).toBe('SECRET-ADDRESS-9')
    expect(acceptedBody.requester?.profile?.lastName).toBeUndefined()
    expect(JSON.stringify(acceptedBody)).not.toContain('secret-requester@example.com')
  })
})

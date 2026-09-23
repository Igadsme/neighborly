import { INestApplication, ValidationPipe } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { AuthGuard } from '../auth/auth.guard'
import { PrismaService } from '../prisma/prisma.service'
import { ListingsController } from './listings.controller'
import { ListingsService } from './listings.service'

const secret = 'test-jwt-secret-must-be-32-characters'

type SelectSpec = Record<string, unknown>

const publicSeller = {
  id: 'seller-1',
  profile: {
    displayName: 'Ada L',
    firstName: 'Ada',
    neighborhood: 'Hayes Valley',
    city: 'San Francisco'
  }
}

const seller = {
  id: 'seller-1',
  email: 'seller@example.com',
  passwordHash: 'seller-password-hash',
  status: 'ACTIVE',
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-06-01T00:00:00.000Z'),
  deletedAt: null,
  profile: {
    id: 'profile-1',
    userId: 'seller-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    displayName: 'Ada L',
    bio: 'Private bio',
    neighborhood: 'Hayes Valley',
    city: 'San Francisco',
    state: 'CA',
    latitude: '37.776543',
    longitude: '-122.424123',
    phoneVerified: true,
    emailVerified: false,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-06-01T00:00:00.000Z')
  }
}

const listing = {
  id: 'listing-1',
  sellerId: 'seller-1',
  categoryId: '11111111-1111-4111-8111-111111111111',
  title: 'Oak chair',
  description: 'Solid oak dining chair',
  priceCents: 4000,
  condition: 'Good',
  status: 'PUBLISHED',
  neighborhood: 'Hayes Valley',
  city: 'San Francisco',
  latitude: '37.776543',
  longitude: '-122.424123',
  radiusMiles: 5,
  pickupAvailable: true,
  deliveryAvailable: false,
  shippingAvailable: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  deletedAt: null,
  category: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Furniture',
    slug: 'furniture',
    createdAt: new Date('2025-01-01T00:00:00.000Z')
  },
  seller,
  images: [
    {
      id: 'image-1',
      listingId: 'listing-1',
      objectKey: 'listings/oak-chair.jpg',
      sortOrder: 0,
      createdAt: new Date('2026-01-01T00:00:00.000Z')
    }
  ]
}

const favorite = {
  userId: 'buyer-1',
  listingId: 'listing-1',
  createdAt: new Date('2026-02-01T00:00:00.000Z'),
  user: {
    id: 'buyer-1',
    email: 'buyer-secret@example.com',
    passwordHash: 'buyer-password-hash',
    status: 'ACTIVE',
    profile: {
      firstName: 'Grace',
      lastName: 'Hopper',
      bio: 'Buyer private bio',
      latitude: '40.712800',
      longitude: '-74.006000'
    }
  },
  listing
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)
}

/** Applies the Prisma select the service passed. Unselected fields stay on the fixture so a widened query leaks them. */
function projectSelect(record: Record<string, unknown>, select: SelectSpec): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, spec] of Object.entries(select)) {
    if (!spec) continue
    const value = record[key]
    if (spec === true) {
      output[key] = value
      continue
    }
    if (!isRecord(spec)) continue
    const nestedSelect = spec.select
    if (isRecord(nestedSelect)) {
      if (Array.isArray(value)) {
        output[key] = value.map(item => (isRecord(item) ? projectSelect(item, nestedSelect) : item))
      } else if (isRecord(value)) {
        output[key] = projectSelect(value, nestedSelect)
      } else {
        output[key] = value
      }
      continue
    }
    const nestedInclude = spec.include
    if (isRecord(nestedInclude) && isRecord(value)) {
      output[key] = projectInclude(value, nestedInclude)
      continue
    }
    output[key] = value
  }
  return output
}

function projectInclude(record: Record<string, unknown>, include: SelectSpec): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value) || isRecord(value)) continue
    output[key] = value
  }
  for (const [key, spec] of Object.entries(include)) {
    const value = record[key]
    if (spec === true) {
      output[key] = value
      continue
    }
    if (!isRecord(spec)) continue
    const nestedSelect = spec.select
    if (isRecord(nestedSelect)) {
      if (Array.isArray(value)) {
        output[key] = value.map(item => (isRecord(item) ? projectSelect(item, nestedSelect) : item))
      } else if (isRecord(value)) {
        output[key] = projectSelect(value, nestedSelect)
      } else {
        output[key] = value
      }
      continue
    }
    const nestedInclude = spec.include
    if (isRecord(nestedInclude) && isRecord(value)) output[key] = projectInclude(value, nestedInclude)
  }
  return output
}

function expectPublicListing(body: unknown) {
  const listingBody = body as {
    latitude?: unknown
    longitude?: unknown
    seller?: unknown
  }
  expect(listingBody.seller).toEqual(publicSeller)
  expect(listingBody.latitude).toBeUndefined()
  expect(listingBody.longitude).toBeUndefined()

  const serialized = JSON.stringify(body)
  expect(serialized).not.toContain('passwordHash')
  expect(serialized).not.toContain('seller-password-hash')
  expect(serialized).not.toContain('buyer-password-hash')
  expect(serialized).not.toContain('seller@example.com')
  expect(serialized).not.toContain('buyer-secret@example.com')
  expect(serialized).not.toContain('Lovelace')
  expect(serialized).not.toContain('Hopper')
  expect(serialized).not.toContain('Private bio')
  expect(serialized).not.toContain('Buyer private bio')
  expect(serialized).not.toContain('37.776543')
  expect(serialized).not.toContain('-122.424123')
  expect(serialized).not.toContain('40.712800')
  expect(serialized).not.toContain('-74.006000')
  expect(serialized).not.toContain('phoneVerified')
  expect(serialized).not.toContain('emailVerified')
  expect(serialized).not.toContain('"email"')
  expect(serialized).not.toContain('"status":"ACTIVE"')
}

describe('Public listing HTTP reads', () => {
  const queries: { list?: SelectSpec; get?: SelectSpec; favorites?: SelectSpec } = {}
  const prisma = {
    listing: {
      findMany: jest.fn(async (args: { select?: SelectSpec }) => {
        queries.list = args as SelectSpec
        if (!args.select) return [listing]
        return [projectSelect(listing, args.select)]
      }),
      findFirst: jest.fn(async (args: { select?: SelectSpec }) => {
        queries.get = args as SelectSpec
        if (!args.select) return listing
        return projectSelect(listing, args.select)
      })
    },
    user: {
      findUnique: jest.fn(async (args: { where?: { id?: string } }) => ({
        id: args?.where?.id ?? 'buyer-1',
        email: 'buyer@example.com',
        status: 'ACTIVE',
        deletedAt: null
      }))
    },
    favorite: {
      findMany: jest.fn(async (args: { select?: SelectSpec; include?: SelectSpec }) => {
        queries.favorites = args as SelectSpec
        if (args.select) return [projectSelect(favorite, args.select)]
        if (args.include) return [projectInclude(favorite, args.include)]
        return [favorite]
      })
    }
  }

  let app: INestApplication
  let baseUrl: string
  let accessToken: string

  beforeAll(async () => {
    process.env.JWT_SECRET = secret
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      controllers: [ListingsController],
      providers: [ListingsService, AuthGuard, { provide: PrismaService, useValue: prisma }]
    }).compile()

    app = moduleRef.createNestApplication({ forceCloseConnections: true })
    app.setGlobalPrefix('api/v1')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address()
    if (!address || typeof address === 'string') throw new Error('HTTP server is not listening')
    baseUrl = `http://127.0.0.1:${address.port}`
    accessToken = moduleRef.get(JwtService).sign({ sub: 'buyer-1', email: 'buyer@example.com' }, { secret })
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /api/v1/listings returns the public seller card only', async () => {
    const response = await fetch(`${baseUrl}/api/v1/listings`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as unknown[]

    expect(body).toHaveLength(1)
    expectPublicListing(body[0])
    expect(queries.list).toBeDefined()
  })

  it('GET /api/v1/listings/:id returns the public seller card only', async () => {
    const response = await fetch(`${baseUrl}/api/v1/listings/listing-1`)
    expect(response.status).toBe(200)
    expectPublicListing(await response.json())
    expect(queries.get).toBeDefined()
  })

  it('GET /api/v1/listings/favorites returns the public seller card only', async () => {
    const response = await fetch(`${baseUrl}/api/v1/listings/favorites`, {
      headers: { authorization: `Bearer ${accessToken}` }
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as Array<{ user?: unknown; listing?: unknown }>

    expect(body).toHaveLength(1)
    expect(body[0].user).toBeUndefined()
    expectPublicListing(body[0].listing)
    expect(queries.favorites).toMatchObject({ where: { userId: 'buyer-1' } })
  })
})

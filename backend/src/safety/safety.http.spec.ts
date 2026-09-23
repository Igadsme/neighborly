import { INestApplication, ValidationPipe } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { AuthGuard } from '../auth/auth.guard'
import { AuthService } from '../auth/auth.service'
import { resetRateLimitsForTests } from '../common/rate-limit'
import { testJwtSecret } from '../common/testing/http-app'
import { PrismaService } from '../prisma/prisma.service'
import { ListingsController } from '../listings/listings.controller'
import { ListingsService } from '../listings/listings.service'
import { MessagingController } from '../messaging/messaging.controller'
import { MessagingGateway } from '../messaging/messaging.gateway'
import { MessagingService } from '../messaging/messaging.service'
import { RequestsController } from '../requests/requests.controller'
import { RequestsService } from '../requests/requests.service'
import { AuthController } from '../auth/auth.controller'
import { ModerationController } from './moderation.controller'
import { SafetyController } from './safety.controller'
import { SafetyService } from './safety.service'

const reporterId = '11111111-1111-4111-8111-111111111111'
const listingId = '33333333-3333-4333-8333-333333333333'

describe('Safety HTTP', () => {
  const prisma = {
    listing: { findFirst: jest.fn(), create: jest.fn() },
    user: { findFirst: jest.fn(), findUnique: jest.fn() },
    message: { findUnique: jest.fn() },
    communityPost: { findFirst: jest.fn() },
    conversationParticipant: { findUnique: jest.fn() },
    report: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    blockedUser: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
    staffRoleAssignment: { findFirst: jest.fn() },
    needRequest: { findUnique: jest.fn() }
  }
  let app: INestApplication
  let baseUrl = ''
  let token = ''

  beforeAll(async () => {
    process.env.JWT_SECRET = testJwtSecret
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      controllers: [SafetyController, ModerationController],
      providers: [SafetyService, AuthGuard, { provide: PrismaService, useValue: prisma }]
    }).compile()
    app = moduleRef.createNestApplication({ forceCloseConnections: true })
    app.setGlobalPrefix('api/v1')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address()
    if (!address || typeof address === 'string') throw new Error('HTTP server is not listening')
    baseUrl = `http://127.0.0.1:${address.port}`
    token = moduleRef.get(JwtService).sign({ sub: reporterId, email: 'ada@example.com' }, { secret: testJwtSecret })
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    resetRateLimitsForTests()
    delete process.env.RATE_LIMIT_ENFORCE
  })

  function post(path: string, body: unknown, authorization?: string) {
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '198.51.100.20',
        ...(authorization ? { Authorization: authorization } : {})
      },
      body: JSON.stringify(body)
    })
  }

  it('returns 401 without a token and 400 for a malformed report', async () => {
    const missing = await post('/api/v1/safety/reports', { targetType: 'LISTING', targetId: listingId, reason: 'SPAM' })
    expect(missing.status).toBe(401)

    const invalid = await post('/api/v1/safety/reports', { targetType: 'LISTING', targetId: 'not-a-uuid', reason: 'SPAM' }, `Bearer ${token}`)
    expect(invalid.status).toBe(400)
    expect(prisma.listing.findFirst).not.toHaveBeenCalled()
  })

  it('returns 404 for a missing listing and 409 for a duplicate report', async () => {
    prisma.listing.findFirst.mockResolvedValue(null)
    const missing = await post('/api/v1/safety/reports', { targetType: 'LISTING', targetId: listingId, reason: 'SPAM' }, `Bearer ${token}`)
    expect(missing.status).toBe(404)

    prisma.listing.findFirst.mockResolvedValue({ sellerId: '22222222-2222-4222-8222-222222222222' })
    prisma.report.findUnique.mockResolvedValue({ id: 'existing' })
    const duplicate = await post('/api/v1/safety/reports', { targetType: 'LISTING', targetId: listingId, reason: 'SPAM' }, `Bearer ${token}`)
    expect(duplicate.status).toBe(409)
    expect(await duplicate.json()).toMatchObject({ message: 'You already reported this' })
  })

  it('returns 403 when a neighbor opens the moderation queue', async () => {
    prisma.staffRoleAssignment.findFirst.mockResolvedValue(null)
    const response = await fetch(`${baseUrl}/api/v1/moderation/reports`, { headers: { Authorization: `Bearer ${token}` } })
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ message: 'Moderator access is required' })
    expect(prisma.report.findMany).not.toHaveBeenCalled()
  })

  it('returns 429 when report creation exceeds the caller limit', async () => {
    process.env.RATE_LIMIT_ENFORCE = '1'
    process.env.RATE_LIMIT_REPORTS = '1'
    prisma.listing.findFirst.mockResolvedValue(null)
    const body = { targetType: 'LISTING', targetId: listingId, reason: 'OTHER' }
    const first = await post('/api/v1/safety/reports', body, `Bearer ${token}`)
    const second = await post('/api/v1/safety/reports', body, `Bearer ${token}`)
    expect(first.status).toBe(404)
    expect(second.status).toBe(429)
    expect(await second.json()).toMatchObject({ message: 'Too many requests' })
  })
})

describe('Abuse limits on auth, messaging, listings, and offers', () => {
  const previous: NodeJS.ProcessEnv = {}

  beforeAll(() => {
    process.env.JWT_SECRET = testJwtSecret
    for (const key of ['RATE_LIMIT_ENFORCE', 'RATE_LIMIT_AUTH_LOGIN', 'RATE_LIMIT_MESSAGING', 'RATE_LIMIT_LISTINGS', 'RATE_LIMIT_OFFERS']) {
      previous[key] = process.env[key]
    }
    process.env.RATE_LIMIT_ENFORCE = '1'
    process.env.RATE_LIMIT_AUTH_LOGIN = '1'
    process.env.RATE_LIMIT_MESSAGING = '1'
    process.env.RATE_LIMIT_LISTINGS = '1'
    process.env.RATE_LIMIT_OFFERS = '1'
  })

  afterAll(() => {
    resetRateLimitsForTests()
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  beforeEach(() => resetRateLimitsForTests())

  async function boot(controllers: unknown[], providers: unknown[]) {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      controllers: controllers as never,
      providers: providers as never
    }).compile()
    const app = moduleRef.createNestApplication({ forceCloseConnections: true })
    app.setGlobalPrefix('api/v1')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address()
    if (!address || typeof address === 'string') throw new Error('HTTP server is not listening')
    const token = moduleRef.get(JwtService).sign({ sub: reporterId, email: 'ada@example.com' }, { secret: testJwtSecret })
    return { app, baseUrl: `http://127.0.0.1:${address.port}`, token }
  }

  async function twice(url: string, init: RequestInit) {
    const first = await fetch(url, init)
    const second = await fetch(url, init)
    return [first, second] as const
  }

  it('returns 429 on the second login from the same address', async () => {
    const booted = await boot([AuthController], [
      AuthService,
      { provide: PrismaService, useValue: { user: { findUnique: async () => null } } }
    ])
    const init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.40' },
      body: JSON.stringify({ email: 'ada@example.com', password: 'wrong-password' })
    }
    const [first, second] = await twice(`${booted.baseUrl}/api/v1/auth/login`, init)
    expect(first.status).toBe(401)
    expect(second.status).toBe(429)
    await booted.app.close()
  })

  it('returns 429 on the second message send', async () => {
    const booted = await boot([MessagingController], [
      MessagingService,
      AuthGuard,
      { provide: MessagingGateway, useValue: { publishMessage: jest.fn() } },
      {
        provide: PrismaService,
        useValue: {
          conversationParticipant: { findUnique: async () => null, findMany: async () => [] },
          blockedUser: { findFirst: async () => null }
        }
      }
    ])
    const init = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${booted.token}`,
        'x-forwarded-for': '198.51.100.41'
      },
      body: JSON.stringify({ body: 'hello neighbor' })
    }
    const [first, second] = await twice(`${booted.baseUrl}/api/v1/conversations/${listingId}/messages`, init)
    expect(first.status).toBe(403)
    expect(second.status).toBe(429)
    await booted.app.close()
  })

  it('returns 429 on the second listing create', async () => {
    const booted = await boot([ListingsController], [
      ListingsService,
      AuthGuard,
      { provide: PrismaService, useValue: { listing: { create: async () => ({ id: listingId }) } } }
    ])
    const init = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${booted.token}`,
        'x-forwarded-for': '198.51.100.42'
      },
      body: JSON.stringify({
        categoryId: listingId,
        title: 'Oak chair',
        description: 'Solid oak dining chair.'
      })
    }
    const [first, second] = await twice(`${booted.baseUrl}/api/v1/listings`, init)
    expect(first.status).toBe(201)
    expect(second.status).toBe(429)
    await booted.app.close()
  })

  it('returns 429 on the second offer', async () => {
    const booted = await boot([RequestsController], [
      RequestsService,
      AuthGuard,
      {
        provide: PrismaService,
        useValue: {
          needRequest: { findUnique: async () => null },
          blockedUser: { findFirst: async () => null }
        }
      }
    ])
    const init = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${booted.token}`,
        'x-forwarded-for': '198.51.100.43'
      },
      body: JSON.stringify({ message: 'I can help with this.' })
    }
    const [first, second] = await twice(`${booted.baseUrl}/api/v1/requests/${listingId}/offers`, init)
    expect(first.status).toBe(404)
    expect(second.status).toBe(429)
    await booted.app.close()
  })
})

import { INestApplication, ValidationPipe } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { AuthGuard } from '../auth/auth.guard'
import { testJwtSecret } from '../common/testing/http-app'
import { PrismaService } from '../prisma/prisma.service'
import { MessagingController } from './messaging.controller'
import { MessagingGateway } from './messaging.gateway'
import { MessagingService } from './messaging.service'

const callerId = '11111111-1111-4111-8111-111111111111'
const sellerId = '22222222-2222-4222-8222-222222222222'
const listingId = '33333333-3333-4333-8333-333333333333'
const conversationId = '44444444-4444-4444-8444-444444444444'

describe('Conversations HTTP', () => {
  const realtime = { publishMessage: jest.fn() }
  const prisma = {
    user: { findUnique: jest.fn() },
    listing: { findUnique: jest.fn() },
    conversation: { findFirst: jest.fn(), create: jest.fn() },
    conversationParticipant: { findUnique: jest.fn(), findMany: jest.fn() },
    blockedUser: { findFirst: jest.fn() },
    $transaction: jest.fn()
  }
  let app: INestApplication
  let baseUrl = ''
  let token = ''

  beforeAll(async () => {
    process.env.JWT_SECRET = testJwtSecret
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      controllers: [MessagingController],
      providers: [
        MessagingService,
        AuthGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: MessagingGateway, useValue: realtime }
      ]
    }).compile()
    app = moduleRef.createNestApplication({ forceCloseConnections: true })
    app.setGlobalPrefix('api/v1')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address()
    if (!address || typeof address === 'string') throw new Error('HTTP server is not listening')
    baseUrl = `http://127.0.0.1:${address.port}`
    token = moduleRef.get(JwtService).sign({ sub: callerId, email: 'buyer@example.com' }, { secret: testJwtSecret })
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    prisma.user.findUnique.mockResolvedValue({ id: sellerId, status: 'ACTIVE', deletedAt: null })
    prisma.listing.findUnique.mockResolvedValue({ id: listingId, sellerId, status: 'PUBLISHED', deletedAt: null })
    prisma.conversation.findFirst.mockResolvedValue(null)
    prisma.conversation.create.mockResolvedValue({ id: conversationId })
    prisma.conversationParticipant.findUnique.mockResolvedValue({ userId: callerId, conversationId })
    prisma.conversationParticipant.findMany.mockResolvedValue([])
    prisma.blockedUser.findFirst.mockResolvedValue(null)
    prisma.$transaction.mockImplementation(async (work: (tx: {
      conversation: { findFirst: typeof prisma.conversation.findFirst; create: typeof prisma.conversation.create; update: () => Promise<unknown> }
      message: { create: (args: { data: { body: string; conversationId: string; senderId: string } }) => Promise<unknown> }
    }) => Promise<unknown>) => work({
      conversation: {
        findFirst: prisma.conversation.findFirst,
        create: prisma.conversation.create,
        update: async () => ({ id: conversationId })
      },
      message: {
        create: async args => ({
          id: 'message-1',
          conversationId: args.data.conversationId,
          senderId: args.data.senderId,
          body: args.data.body,
          createdAt: '2026-09-23T18:00:00.000Z'
        })
      }
    }))
  })

  function post(body: unknown, authorization?: string) {
    return fetch(`${baseUrl}/api/v1/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {})
      },
      body: JSON.stringify(body)
    })
  }

  it('returns 401 when the caller is not authenticated', async () => {
    const missing = await post({ participantId: sellerId, body: 'Hello' })
    expect(missing.status).toBe(401)

    const invalid = await post({ participantId: sellerId, body: 'Hello' }, 'Bearer not-a-token')
    expect(invalid.status).toBe(401)
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(prisma.conversation.create).not.toHaveBeenCalled()
    expect(realtime.publishMessage).not.toHaveBeenCalled()
  })

  it('returns 400 when the message body is blank after trimming', async () => {
    const response = await post({ participantId: sellerId, listingId, body: '   ' }, `Bearer ${token}`)
    expect(response.status).toBe(400)
    expect(prisma.conversation.create).not.toHaveBeenCalled()
  })

  it('creates the conversation and returns the first message', async () => {
    const response = await post({
      participantId: sellerId,
      listingId,
      body: '  Is this still available?  '
    }, `Bearer ${token}`)

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      conversation: { id: conversationId },
      message: {
        id: 'message-1',
        conversationId,
        senderId: callerId,
        body: 'Is this still available?',
        createdAt: '2026-09-23T18:00:00.000Z'
      },
      reused: false
    })
    expect(realtime.publishMessage).toHaveBeenCalledTimes(1)
  })

  it('returns 403 when the other user is not the listing seller', async () => {
    prisma.listing.findUnique.mockResolvedValue({ id: listingId, sellerId: callerId, status: 'PUBLISHED', deletedAt: null })
    const response = await post({ participantId: sellerId, listingId, body: 'Hello' }, `Bearer ${token}`)
    expect(response.status).toBe(403)
    expect(prisma.conversation.create).not.toHaveBeenCalled()
  })
})

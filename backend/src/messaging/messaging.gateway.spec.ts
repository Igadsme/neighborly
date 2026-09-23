import { WsException } from '@nestjs/websockets'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { Socket } from 'socket.io'
import { PrismaService } from '../prisma/prisma.service'
import { MessagingGateway } from './messaging.gateway'

const secret = 'test-jwt-secret-must-be-32-characters'

function handshake(auth: Record<string, unknown> = {}, authorization?: string) {
  return {
    auth,
    headers: authorization ? { authorization } : {}
  }
}

function fakeSocket(options?: { auth?: Record<string, unknown>; authorization?: string; userId?: string }) {
  const socket = {
    handshake: handshake(options?.auth, options?.authorization),
    data: { userId: options?.userId } as { userId?: string },
    disconnect: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined)
  }
  return socket
}

describe('MessagingGateway auth', () => {
  const userId = 'user-real'
  const email = 'ada@example.com'
  const prisma = {
    conversationParticipant: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() }
  }
  let gateway: MessagingGateway
  let jwt: JwtService

  beforeAll(async () => {
    process.env.JWT_SECRET = secret
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      providers: [MessagingGateway, { provide: PrismaService, useValue: prisma }]
    }).compile()
    gateway = moduleRef.get(MessagingGateway)
    jwt = moduleRef.get(JwtService)
  })

  beforeEach(() => {
    jest.clearAllMocks()
    prisma.user.findUnique.mockResolvedValue({ id: userId, email, status: 'ACTIVE', deletedAt: null })
  })

  function tokenFor(sub: string, claims: Record<string, unknown> = { email }) {
    return jwt.sign({ sub, ...claims }, { secret })
  }

  function middleware() {
    let use: ((socket: Socket, next: (err?: Error) => void) => void) | undefined
    gateway.afterInit({
      use: (fn: (socket: Socket, next: (err?: Error) => void) => void) => {
        use = fn
      }
    } as unknown as MessagingGateway['server'])
    if (!use) throw new Error('handshake middleware was not registered')
    return use
  }

  async function runMiddleware(socket: ReturnType<typeof fakeSocket>) {
    const next = jest.fn()
    middleware()(socket as unknown as Socket, next)
    await new Promise(resolve => setImmediate(resolve))
    return next
  }

  it('rejects a handshake without a token', async () => {
    const socket = fakeSocket()
    const next = await runMiddleware(socket)

    expect(next).toHaveBeenCalledTimes(1)
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error)
    expect(socket.data.userId).toBeUndefined()
  })

  it('disconnects a connection that has no token', async () => {
    const socket = fakeSocket({ userId: 'forged-user' })
    await gateway.handleConnection(socket as unknown as Socket)

    expect(socket.disconnect).toHaveBeenCalledWith(true)
    expect(socket.data.userId).toBeUndefined()
  })

  it('accepts a valid access token and stores userId from sub', async () => {
    const socket = fakeSocket({ auth: { token: tokenFor(userId), userId: 'forged-user' } })
    await gateway.handleConnection(socket as unknown as Socket)

    expect(socket.disconnect).not.toHaveBeenCalled()
    expect(socket.data.userId).toBe(userId)
  })

  it('accepts a bearer token on the handshake Authorization header', async () => {
    const socket = fakeSocket({ authorization: `Bearer ${tokenFor(userId)}` })
    const next = await runMiddleware(socket)

    expect(next).toHaveBeenCalledWith()
    expect(socket.data.userId).toBe(userId)
  })

  it('rejects a token that does not verify', async () => {
    const socket = fakeSocket({ auth: { token: 'not-a-jwt' } })
    await gateway.handleConnection(socket as unknown as Socket)

    expect(socket.disconnect).toHaveBeenCalledWith(true)
    expect(socket.data.userId).toBeUndefined()
  })

  it('rejects a token that has no sub', async () => {
    const socket = fakeSocket({ auth: { token: jwt.sign({ email }, { secret }) } })
    await gateway.handleConnection(socket as unknown as Socket)

    expect(socket.disconnect).toHaveBeenCalledWith(true)
    expect(socket.data.userId).toBeUndefined()
  })

  it('disconnects a suspended account even when the access token still verifies', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: userId, email, status: 'SUSPENDED', deletedAt: null })
    const socket = fakeSocket({ auth: { token: tokenFor(userId) } })
    await gateway.handleConnection(socket as unknown as Socket)

    expect(socket.disconnect).toHaveBeenCalledWith(true)
    expect(socket.data.userId).toBeUndefined()
  })

  it('joins a conversation only for the authenticated participant', async () => {
    prisma.conversationParticipant.findUnique.mockResolvedValue({ conversationId: 'conv-1', userId })
    const socket = fakeSocket({ userId })

    await expect(gateway.joinConversation(socket as unknown as Socket, { conversationId: 'conv-1', userId: 'someone-else' })).resolves.toEqual({ ok: true })

    expect(prisma.conversationParticipant.findUnique).toHaveBeenCalledWith({
      where: { conversationId_userId: { conversationId: 'conv-1', userId } }
    })
    expect(socket.join).toHaveBeenCalledWith('conversation:conv-1')
  })

  it('does not join when the authenticated user is not a participant', async () => {
    prisma.conversationParticipant.findUnique.mockResolvedValue(null)
    const socket = fakeSocket({ userId })

    await expect(gateway.joinConversation(socket as unknown as Socket, { conversationId: 'conv-1', userId: 'someone-else' })).rejects.toBeInstanceOf(WsException)

    expect(prisma.conversationParticipant.findUnique).toHaveBeenCalledWith({
      where: { conversationId_userId: { conversationId: 'conv-1', userId } }
    })
    expect(socket.join).not.toHaveBeenCalled()
  })

  it('does not join from a client-supplied user id when the socket is unauthenticated', async () => {
    const socket = fakeSocket()
    socket.data.userId = undefined

    await expect(gateway.joinConversation(socket as unknown as Socket, { conversationId: 'conv-1', userId })).rejects.toBeInstanceOf(WsException)

    expect(prisma.conversationParticipant.findUnique).not.toHaveBeenCalled()
    expect(socket.join).not.toHaveBeenCalled()
  })
})

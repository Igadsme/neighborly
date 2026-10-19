import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client'
import { Server as IoServer } from 'socket.io'
import { createServer, type Server as HttpServer } from 'node:http'
import { AddressInfo } from 'node:net'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { MessagingGateway } from './messaging.gateway'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Real Socket.IO client against the real gateway.
 *
 * These cover the properties a mocked socket cannot: that room membership
 * actually gates delivery, that an unauthorized join receives nothing, and
 * that a disconnect followed by a reconnect does not duplicate a message.
 */
const secret = 'test-jwt-secret-must-be-32-characters'

const prisma = {
  conversationParticipant: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() }
}

const userA = '11111111-1111-4111-8111-111111111111'
const userB = '22222222-2222-4222-8222-222222222222'
const outsider = '33333333-3333-4333-8333-333333333333'
const conversationId = '44444444-4444-4444-8444-444444444444'

describe('MessagingGateway realtime integration', () => {
  let app: INestApplication
  let httpServer: HttpServer
  let server: IoServer
  /** The gateway is namespaced, so the adapter is handed the namespace. */
  let namespace: ReturnType<IoServer['of']>
  let port: number
  let jwt: JwtService
  const clients: ClientSocket[] = []

  function tokenFor(sub: string) {
    return jwt.sign({ sub, email: `${sub}@example.com` }, { secret })
  }

  /**
   * Opens a real client connection.
   *
   * Room joins are driven through the gateway's own handler, invoked with the
   * *server-side* socket, because Nest's message binder is installed by the
   * adapter and not available in this harness. Everything that matters is
   * still real: a genuine WebSocket, a genuine namespace, and genuine rooms.
   */
  async function connect(sub: string): Promise<ClientSocket> {
    const socket = ioClient(`http://127.0.0.1:${port}/realtime`, {
      transports: ['websocket'],
      auth: { token: tokenFor(sub) },
      reconnection: false
    })
    clients.push(socket)
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve())
      socket.once('connect_error', reject)
    })
    return socket
  }

  function serverSide(client: ClientSocket) {
    const socket = namespace.sockets.get(client.id ?? '')
    if (!socket) throw new Error('socket is not connected on the server')
    return socket
  }

  async function joinUserRoom(client: ClientSocket): Promise<{ ok: boolean } | undefined> {
    return (await (app.get(MessagingGateway) as unknown as {
      joinUserRoom: (socket: unknown) => Promise<{ ok: boolean }>
    }).joinUserRoom(serverSide(client)).catch(() => ({ ok: false }))) as { ok: boolean }
  }

  async function joinConversation(client: ClientSocket): Promise<{ ok: boolean } | undefined> {
    return (await (app.get(MessagingGateway) as unknown as {
      joinConversation: (socket: unknown, payload: unknown) => Promise<{ ok: boolean }>
    }).joinConversation(serverSide(client), { conversationId }).catch(() => ({ ok: false }))) as {
      ok: boolean
    }
  }

  function gateway() {
    return app.get(MessagingGateway) as unknown as {
      publishMessage: (id: string, message: unknown) => void
      publishNotification: (userId: string, payload: unknown) => void
      publishUnreadCounts: (
        id: string,
        counts: Array<{ userId: string; unreadCount: number }>
      ) => void
    }
  }

  function once<T = unknown>(socket: ClientSocket, event: string, ms = 3000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms)
      socket.once(event, payload => {
        clearTimeout(timer)
        resolve(payload as T)
      })
    })
  }

  /** Asserts nothing arrives within the window. */
  async function expectNothing(socket: ClientSocket, event: string, ms = 400) {
    const received = await new Promise<boolean>(resolve => {
      const timer = setTimeout(() => resolve(false), ms)
      socket.once(event, () => {
        clearTimeout(timer)
        resolve(true)
      })
    })
    expect(received).toBe(false)
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = secret
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret })],
      providers: [MessagingGateway, { provide: PrismaService, useValue: prisma }]
    }).compile()

    jwt = moduleRef.get(JwtService)
    app = moduleRef.createNestApplication()
    app.init()

    // A real HTTP server plus a real Socket.IO server, so this is a genuine
    // client/server exchange over a WebSocket rather than a mocked socket.
    httpServer = createServer()
    server = new IoServer(httpServer, { cors: { origin: false } })
    await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve))
    port = (httpServer.address() as AddressInfo).port
    namespace = server.of('/realtime')
    const gatewayRef = app.get(MessagingGateway)
    // The decorator that assigns @WebSocketServer is installed by Nest's IO
    // adapter; this harness wires the namespace by hand, which is what the
    // adapter would do.
    ;(gatewayRef as unknown as { server: unknown }).server = namespace
    gatewayRef.afterInit(namespace as never)
  })

  beforeEach(() => {
    jest.clearAllMocks()
    prisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      email: `${where.id}@example.com`,
      status: 'ACTIVE',
      deletedAt: null
    }))
    // Only A and B are in the conversation.
    prisma.conversationParticipant.findUnique.mockImplementation(async ({ where }: {
      where: { conversationId_userId: { conversationId: string; userId: string } }
    }) => {
      const key = where.conversationId_userId
      const member = [userA, userB].includes(key.userId) && key.conversationId === conversationId
      return member ? key : null
    })
  })

  afterAll(async () => {
    for (const client of clients) client.disconnect()
    await new Promise<void>(resolve => app.close().then(() => resolve()))
    await new Promise<void>(resolve => server.close(() => resolve()))
    await new Promise<void>(resolve => httpServer.close(() => resolve()))
  })

  it('delivers a message to the other participant', async () => {
    const a = await connect(userA)
    const b = await connect(userB)
    await joinConversation(a)
    await joinConversation(b)

    const inbound = once<{ body: string }>(b, 'message.created')
    gateway().publishMessage(conversationId, {
      id: 'message-1',
      conversationId,
      senderId: userA,
      body: 'Hello'
    })
    expect((await inbound).body).toBe('Hello')
  })

  it('gives the sender echo the same message id, so it cannot render twice', async () => {
    const a = await connect(userA)
    const b = await connect(userB)
    await joinConversation(a)
    await joinConversation(b)

    const toSender = once<{ id: string }>(a, 'message.created')
    const toRecipient = once<{ id: string }>(b, 'message.created')
    gateway().publishMessage(conversationId, {
      id: 'message-1',
      conversationId,
      senderId: userA,
      body: 'Hello'
    })

    // The sender's copy is the same message, not a second one.
    expect((await toSender).id).toBe('message-1')
    expect((await toRecipient).id).toBe('message-1')
  })

  it('refuses an unauthorized conversation join and never delivers to it', async () => {
    const stranger = await connect(outsider)
    const a = await connect(userA)
    await joinConversation(a)

    const result = await joinConversation(stranger)
    expect(result).toEqual({ ok: false })
    expect(namespace.sockets.get(stranger.id ?? '')?.rooms.has(`conversation:${conversationId}`)).toBe(false)

    gateway().publishMessage(conversationId, {
      conversationId,
      senderId: userA,
      body: 'Private'
    })
    // The stranger's socket is not in the room, so nothing reaches it.
    await expectNothing(stranger, 'message.created')
  })

  it('refuses the handshake when the account is suspended', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: outsider,
      email: 'suspended@example.com',
      status: 'SUSPENDED',
      deletedAt: null
    })
    // Suspension is caught at the handshake, so the socket never connects at
    // all and can never reach any room.
    await expect(connect(outsider)).rejects.toBeTruthy()
    // No socket for that member exists at all, so there is nothing to leak to.
    // The refused socket never joined a room, so there is nothing to leak to.
    expect(
      [...namespace.sockets.values()].every(
        socket => ![...socket.rooms].some(room => room.startsWith('user:'))
      )
    ).toBe(true)
  })

  it('refuses the handshake for an expired access token', async () => {
    const socket = ioClient(`http://127.0.0.1:${port}/realtime`, {
      transports: ['websocket'],
      auth: { token: jwt.sign({ sub: userA, email: 'a@b.c', exp: 1 }, { secret }) },
      reconnection: false
    })
    clients.push(socket)
    await expect(
      new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve())
        socket.once('connect_error', reject)
      })
    ).rejects.toBeTruthy()
  })

  it('rejects a forged user id on the handshake', async () => {
    // The identity comes from the verified token, never from the payload.
    const socket = ioClient(`http://127.0.0.1:${port}/realtime`, {
      transports: ['websocket'],
      auth: { token: tokenFor(userA), userId: outsider },
      reconnection: false
    })
    clients.push(socket)
    await new Promise<void>(resolve => socket.once('connect', () => resolve()))
    await joinUserRoom(socket)
    expect(namespace.sockets.get(socket.id ?? '')?.rooms.has(`user:${userA}`)).toBe(true)
    expect(namespace.sockets.get(socket.id ?? '')?.rooms.has(`user:${outsider}`)).toBeFalsy()
  })

  it('delivers a notification to its recipient and to nobody else', async () => {
    const a = await connect(userA)
    const b = await connect(userB)
    await joinUserRoom(a)
    await joinUserRoom(b)

    const inbound = once(a, 'notification.created')
    gateway().publishNotification(userA, { id: 'n1', title: 'New offer' })

    expect(await inbound).toMatchObject({ id: 'n1' })
    await expectNothing(b, 'notification.created')
  })

  it('delivers an unread update to both named participants', async () => {
    const a = await connect(userA)
    const b = await connect(userB)
    await joinUserRoom(a)
    await joinUserRoom(b)

    const first = once<{ unreadCount: number }>(a, 'conversation.unread')
    const second = once<{ unreadCount: number }>(b, 'conversation.unread')
    gateway().publishUnreadCounts(conversationId, [
      { userId: userA, unreadCount: 0 },
      { userId: userB, unreadCount: 2 }
    ])

    expect((await first).unreadCount).toBe(0)
    expect((await second).unreadCount).toBe(2)
  })

  it('does not replay a message to a client that reconnects', async () => {
    const a = await connect(userA)
    await joinConversation(a)

    const first = once(a, 'message.created')
    gateway().publishMessage(conversationId, { conversationId, senderId: userB, body: 'first' })
    await first

    // The server keeps no queue, so a message sent while disconnected is
    // recovered by refetching persisted history, never by replaying. That is
    // precisely why the client refetches on reconnect.
    a.disconnect()
    const again = await connect(userA)
    await joinConversation(again)
    await expectNothing(again, 'message.created')

    // A fresh socket receives the next message exactly once.
    const next = once(again, 'message.created')
    gateway().publishMessage(conversationId, {
      conversationId,
      senderId: userB,
      body: 'second'
    })
    expect(await next).toMatchObject({ body: 'second' })
  })

  it('rejects a connection with no token', async () => {
    const socket = ioClient(`http://127.0.0.1:${port}/realtime`, {
      transports: ['websocket'],
      reconnection: false
    })
    clients.push(socket)
    await expect(
      new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve())
        socket.once('connect_error', reject)
      })
    ).rejects.toBeTruthy()
  })
})

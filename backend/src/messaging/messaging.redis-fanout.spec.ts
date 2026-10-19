import { INestApplication } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { ServerOptions } from 'socket.io'
import { io as ioClient, Socket } from 'socket.io-client'
import { PrismaService } from '../prisma/prisma.service'
import { MessagingGateway } from './messaging.gateway'
import { RedisIoAdapter } from './redis-io.adapter'
import { SocketRedis, type RedisFactory } from './socket-redis'

const secret = 'test-jwt-secret-must-be-32-characters'
const conversationId = 'conv-fanout'

type Handler = (...args: unknown[]) => void

/**
 * In-memory stand-in for the ioredis pub/sub pair. It has no `pSubscribe`,
 * so @socket.io/redis-adapter takes the ioredis path: psubscribe, subscribe(array),
 * pmessageBuffer, and messageBuffer.
 */
class MemoryRedis {
  private readonly patterns = new Set<string>()
  private readonly channels = new Set<string>()
  private readonly handlers = new Map<string, Set<Handler>>()

  constructor(private readonly hub: MemoryRedis[]) {}

  psubscribe(pattern: string) {
    this.patterns.add(pattern)
    return Promise.resolve()
  }

  subscribe(channels: string[]) {
    for (const channel of channels) this.channels.add(channel)
    return Promise.resolve()
  }

  on(event: string, listener: Handler) {
    const set = this.handlers.get(event) ?? new Set()
    set.add(listener)
    this.handlers.set(event, set)
    return this
  }

  publish(channel: string | Buffer, message: string | Buffer) {
    const channelText = Buffer.isBuffer(channel) ? channel.toString() : String(channel)
    const messageBuffer = Buffer.isBuffer(message) ? message : Buffer.from(message)
    for (const client of this.hub) {
      for (const pattern of client.patterns) {
        if (globMatch(pattern, channelText)) {
          for (const listener of client.handlers.get('pmessageBuffer') ?? []) {
            listener(pattern, Buffer.from(channelText), messageBuffer)
          }
        }
      }
      if (client.channels.has(channelText)) {
        for (const listener of client.handlers.get('messageBuffer') ?? []) {
          listener(Buffer.from(channelText), messageBuffer)
        }
      }
    }
    return Promise.resolve(1)
  }

  duplicate() {
    const clone = new MemoryRedis(this.hub)
    this.hub.push(clone)
    return clone
  }

  quit() {
    return Promise.resolve('OK')
  }

  disconnect() {}

  ping() {
    return Promise.resolve('PONG')
  }

  listenerCount(event: string) {
    return this.handlers.get(event)?.size ?? 0
  }
}

function globMatch(pattern: string, value: string) {
  const expression = `^${pattern.split('*').map(part => part.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')).join('.*')}$`
  return new RegExp(expression).test(value)
}

function redisPair(hub: MemoryRedis[]) {
  const pub = new MemoryRedis(hub)
  hub.push(pub)
  const sub = pub.duplicate()
  const sockets = new SocketRedis()
  sockets.connection = { mode: 'redis', pub, sub }
  sockets.onModuleInit = async () => undefined
  return sockets
}

describe('Socket.IO Redis fan-out between two gateways', () => {
  let appA: INestApplication
  let appB: INestApplication
  let gatewayA: MessagingGateway
  let baseB = ''
  let jwt: JwtService
  const sockets: Socket[] = []

  beforeAll(async () => {
    process.env.JWT_SECRET = secret
    const hub: MemoryRedis[] = []
    const prisma = {
      conversationParticipant: {
        findUnique: jest.fn(async () => ({ conversationId, userId: 'user-b' }))
      },
      user: {
        findUnique: jest.fn(async () => ({ id: 'user-b', email: 'b@example.com', status: 'ACTIVE', deletedAt: null }))
      }
    }

    const bootedA = await boot(redisPair(hub), prisma)
    const bootedB = await boot(redisPair(hub), prisma)
    appA = bootedA.app
    appB = bootedB.app
    gatewayA = bootedA.gateway
    baseB = bootedB.baseUrl
    jwt = bootedB.jwt
  })

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect()
    await appA?.close()
    await appB?.close()
  })

  it('rejects a handshake with no token on the second gateway', async () => {
    const anonymous = ioClient(`${baseB}/realtime`, { transports: ['websocket'], forceNew: true, reconnection: false })
    sockets.push(anonymous)
    await expect(new Promise((resolve, reject) => {
      anonymous.on('connect', () => reject(new Error('anonymous socket connected')))
      anonymous.on('connect_error', error => resolve(error.message))
    })).resolves.toContain('Unauthorized')
  })

  it('delivers a message emitted on gateway A to a socket joined on gateway B', async () => {
    const token = jwt.sign({ sub: 'user-b', email: 'b@example.com' }, { secret })
    const socket = ioClient(`${baseB}/realtime`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false
    })
    sockets.push(socket)
    await once(socket, 'connect')
    await expect(socket.timeout(2000).emitWithAck('conversation.join', { conversationId })).resolves.toEqual({ ok: true })

    const received = once(socket, 'message.created')
    gatewayA.publishMessage(conversationId, { id: 'msg-1', body: 'from process A' })
    await expect(received).resolves.toEqual({ id: 'msg-1', body: 'from process A' })
  })
})

async function boot(sockets: SocketRedis, prisma: object) {
  const moduleRef = await Test.createTestingModule({
    imports: [JwtModule.register({})],
    providers: [
      MessagingGateway,
      { provide: PrismaService, useValue: prisma },
      { provide: SocketRedis, useValue: sockets }
    ]
  }).compile()
  const app = moduleRef.createNestApplication({ forceCloseConnections: true })
  app.useWebSocketAdapter(new RedisIoAdapter(app, sockets))
  await app.listen(0, '127.0.0.1')
  const address = app.getHttpServer().address()
  if (!address || typeof address === 'string') throw new Error('gateway is not listening')
  return {
    app,
    gateway: moduleRef.get(MessagingGateway),
    jwt: moduleRef.get(JwtService),
    baseUrl: `http://127.0.0.1:${address.port}`
  }
}

function once(socket: Socket, event: string) {
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), 3000)
    socket.once(event, payload => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

describe('Socket.IO bootstrap order', () => {
  let appA: INestApplication
  let appB: INestApplication
  let gatewayA: MessagingGateway
  let baseB = ''
  let jwt: JwtService
  const sockets: Socket[] = []
  const modes: string[] = []
  let opens = 0
  const previousRedis = process.env.REDIS_URL

  beforeAll(async () => {
    process.env.JWT_SECRET = secret
    process.env.REDIS_URL = 'redis://127.0.0.1:6379'
    const hub: MemoryRedis[] = []
    const prisma = {
      conversationParticipant: {
        findUnique: jest.fn(async () => ({ conversationId, userId: 'user-b' }))
      },
      user: {
        findUnique: jest.fn(async () => ({ id: 'user-b', email: 'b@example.com', status: 'ACTIVE', deletedAt: null }))
      }
    }
    const bootedA = await bootLikeMain(freshSockets(hub, () => { opens += 1 }), prisma, modes)
    const bootedB = await bootLikeMain(freshSockets(hub, () => { opens += 1 }), prisma, modes)
    appA = bootedA.app
    appB = bootedB.app
    gatewayA = bootedA.gateway
    baseB = bootedB.baseUrl
    jwt = bootedB.jwt
  })

  afterAll(async () => {
    if (previousRedis === undefined) delete process.env.REDIS_URL
    else process.env.REDIS_URL = previousRedis
    for (const socket of sockets) socket.disconnect()
    await appA?.close()
    await appB?.close()
  })

  it('connects before Nest creates the server, so a message on A reaches a client on B', async () => {
    // createIOServer runs inside init(), before onModuleInit. The old order
    // leaves every recorded mode as single and this expectation fails.
    expect(modes.length).toBeGreaterThan(0)
    expect(modes).not.toContain('single')
    expect(opens).toBe(2)

    const token = jwt.sign({ sub: 'user-b', email: 'b@example.com' }, { secret })
    const socket = ioClient(`${baseB}/realtime`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false
    })
    sockets.push(socket)
    await once(socket, 'connect')
    await expect(socket.timeout(2000).emitWithAck('conversation.join', { conversationId })).resolves.toEqual({ ok: true })

    const received = once(socket, 'message.created')
    gatewayA.publishMessage(conversationId, { id: 'msg-boot', body: 'from process A' })
    await expect(received).resolves.toEqual({ id: 'msg-boot', body: 'from process A' })
  })
})

function freshSockets(hub: MemoryRedis[], onOpen: () => void) {
  const sockets = new SocketRedis()
  const factory: RedisFactory = async () => {
    onOpen()
    const pub = new MemoryRedis(hub)
    hub.push(pub)
    return { pub, sub: pub.duplicate() }
  }
  sockets.factory = factory
  return sockets
}

/**
 * Same order as main.ts. The fresh SocketRedis starts single-node, connect()
 * runs, and only then is the adapter installed. Listening without that
 * connect leaves createIOServer on the single-node adapter.
 */
async function bootLikeMain(sockets: SocketRedis, prisma: object, modes: string[]) {
  const moduleRef = await Test.createTestingModule({
    imports: [JwtModule.register({})],
    providers: [
      MessagingGateway,
      { provide: PrismaService, useValue: prisma },
      { provide: SocketRedis, useValue: sockets }
    ]
  }).compile()
  const app = moduleRef.createNestApplication({ forceCloseConnections: true })
  const live = app.get(SocketRedis)
  expect(live.connection.mode).toBe('single')
  await live.connect()
  const original = RedisIoAdapter.prototype.createIOServer
  const spy = jest.spyOn(RedisIoAdapter.prototype, 'createIOServer').mockImplementation(function (
    this: RedisIoAdapter,
    port: number,
    options?: ServerOptions
  ) {
    modes.push((this as unknown as { sockets: SocketRedis }).sockets.connection.mode)
    return original.call(this, port, options)
  })
  try {
    app.useWebSocketAdapter(new RedisIoAdapter(app, live))
    await app.listen(0, '127.0.0.1')
  } finally {
    spy.mockRestore()
  }
  const address = app.getHttpServer().address()
  if (!address || typeof address === 'string') throw new Error('gateway is not listening')
  return {
    app,
    gateway: moduleRef.get(MessagingGateway),
    jwt: moduleRef.get(JwtService),
    baseUrl: `http://127.0.0.1:${address.port}`
  }
}

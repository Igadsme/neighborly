import { INestApplication } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { GATEWAY_OPTIONS } from '@nestjs/websockets/constants'
import { PrismaService } from '../prisma/prisma.service'
import { MessagingGateway } from './messaging.gateway'

const secret = 'test-jwt-secret-must-be-32-characters'

function namespacePackets(packets: string[]) {
  return packets.filter(packet => packet.includes('/realtime'))
}

async function handshake(baseUrl: string, options?: { auth?: Record<string, unknown>; authorization?: string }) {
  const headers: Record<string, string> = {}
  if (options?.authorization) headers.authorization = options.authorization

  const open = await fetch(`${baseUrl}/socket.io/?EIO=4&transport=polling`, { headers })
  const openText = await open.text()
  if (!open.ok || !openText.startsWith('0')) {
    throw new Error(`engine.io handshake failed (${open.status}): ${openText}`)
  }
  const opened = JSON.parse(openText.slice(1)) as { sid?: string }
  if (!opened.sid) throw new Error(`engine.io handshake missing sid: ${openText}`)

  const session = `${baseUrl}/socket.io/?EIO=4&transport=polling&sid=${encodeURIComponent(opened.sid)}`
  const poll = fetch(session, { headers, signal: AbortSignal.timeout(3000) })
  const connectPacket = options?.auth ? `40/realtime,${JSON.stringify(options.auth)}` : '40/realtime,'
  const posted = await fetch(session, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'text/plain; charset=UTF-8' },
    body: connectPacket
  })
  const postedText = await posted.text()
  if (!posted.ok) throw new Error(`namespace connect failed (${posted.status}): ${postedText}`)

  const polled = await poll
  const polledText = await polled.text()
  if (!polled.ok) throw new Error(`namespace poll failed (${polled.status}): ${polledText}`)
  return polledText.split('\u001e')
}

function expectRejected(packets: string[]) {
  const relevant = namespacePackets(packets)
  expect(relevant.some(packet => packet.startsWith('40/realtime'))).toBe(false)
  const error = relevant.find(packet => packet.startsWith('44/realtime'))
  expect(error).toBeDefined()
  expect(error).toContain('Unauthorized')
}

function expectAccepted(packets: string[]) {
  const relevant = namespacePackets(packets)
  expect(relevant.some(packet => packet.startsWith('44/realtime'))).toBe(false)
  const connected = relevant.find(packet => packet.startsWith('40/realtime'))
  expect(connected).toBeDefined()
  expect(connected).toContain('"sid"')
}

describe('Socket.IO /realtime handshake', () => {
  let app: INestApplication
  let baseUrl: string
  let jwt: JwtService

  beforeAll(async () => {
    process.env.JWT_SECRET = secret
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      providers: [MessagingGateway, {
        provide: PrismaService,
        useValue: {
          conversationParticipant: { findUnique: jest.fn() },
          user: {
            findUnique: jest.fn(async () => ({ id: 'user-real', email: 'ada@example.com', status: 'ACTIVE', deletedAt: null }))
          }
        }
      }]
    }).compile()

    app = moduleRef.createNestApplication({ forceCloseConnections: true })
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address()
    if (!address || typeof address === 'string') throw new Error('HTTP server is not listening')
    baseUrl = `http://127.0.0.1:${address.port}`
    jwt = moduleRef.get(JwtService)
  })

  afterAll(async () => {
    await app.close()
  })

  it('registers the gateway on the /realtime namespace', () => {
    const options = Reflect.getMetadata(GATEWAY_OPTIONS, MessagingGateway) as { namespace?: string }
    expect(options.namespace).toBe('/realtime')
  })

  it('rejects a handshake with no token', async () => {
    expectRejected(await handshake(baseUrl))
  })

  it('rejects a handshake with an invalid token', async () => {
    expectRejected(await handshake(baseUrl, { auth: { token: 'not-a-jwt' } }))
  })

  it('accepts a valid access token in the handshake auth payload', async () => {
    const token = jwt.sign({ sub: 'user-real', email: 'ada@example.com' }, { secret })
    const packets = await handshake(baseUrl, { auth: { token, userId: 'forged-user' } })
    expectAccepted(packets)
    expect(packets.join('\u001e')).not.toContain('forged-user')
    expect(packets.join('\u001e')).not.toContain('ada@example.com')
  })

  it('accepts a valid access token on the Authorization header', async () => {
    const token = jwt.sign({ sub: 'user-real', email: 'ada@example.com' }, { secret })
    expectAccepted(await handshake(baseUrl, { authorization: `Bearer ${token}` }))
  })
})

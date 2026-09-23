import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException
} from '@nestjs/websockets'
import { JwtService } from '@nestjs/jwt'
import { Server, Socket } from 'socket.io'
import { PrismaService } from '../prisma/prisma.service'

interface AccessTokenClaims {
  sub?: string
  email?: string
}

type HandshakeSocket = Socket

@WebSocketGateway({ namespace: '/realtime', cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? [] } })
export class MessagingGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server!: Server

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService
  ) {}

  afterInit(server: Server) {
    server.use((socket, next) => {
      try {
        this.attachUser(socket)
        next()
      } catch (error) {
        next(error instanceof Error ? error : new Error('Unauthorized'))
      }
    })
  }

  handleConnection(client: HandshakeSocket) {
    try {
      this.attachUser(client)
    } catch {
      client.disconnect(true)
    }
  }

  @SubscribeMessage('conversation.join')
  async joinConversation(@ConnectedSocket() client: HandshakeSocket, @MessageBody() body: unknown) {
    const userId = client.data?.userId
    if (typeof userId !== 'string' || !userId) throw new WsException('Unauthorized')

    const conversationId = conversationIdFrom(body)
    if (!conversationId) throw new WsException('Conversation id is required')

    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } }
    })
    if (!participant) throw new WsException('You are not a participant in this conversation')

    await client.join(`conversation:${conversationId}`)
    return { ok: true }
  }

  publishMessage(conversationId: string, message: unknown) {
    this.server?.to(`conversation:${conversationId}`).emit('message.created', message)
  }

  private attachUser(socket: HandshakeSocket) {
    socket.data = socket.data ?? {}
    socket.data.userId = undefined

    const token = tokenFrom(socket)
    if (!token) throw new Error('Unauthorized')

    let payload: AccessTokenClaims | string
    try {
      payload = this.jwt.verify<AccessTokenClaims>(token, { secret: process.env.JWT_SECRET })
    } catch {
      throw new Error('Unauthorized')
    }

    if (!payload || typeof payload === 'string' || typeof payload.sub !== 'string' || !payload.sub || typeof payload.email !== 'string' || !payload.email) {
      throw new Error('Unauthorized')
    }

    socket.data.userId = payload.sub
  }
}

function tokenFrom(socket: HandshakeSocket) {
  const authToken = socket.handshake.auth?.token
  if (typeof authToken === 'string') {
    const token = bearerValue(authToken)
    if (token) return token
  }

  const header = socket.handshake.headers?.authorization
  const value = Array.isArray(header) ? header[0] : header
  if (typeof value !== 'string') return undefined
  return bearerValue(value)
}

function bearerValue(value: string) {
  const token = value.replace(/^Bearer\s+/i, '').trim()
  return token || undefined
}

function conversationIdFrom(body: unknown) {
  if (typeof body === 'string' && body.trim()) return body.trim()
  if (!body || typeof body !== 'object' || !('conversationId' in body)) return undefined
  const conversationId = (body as { conversationId?: unknown }).conversationId
  if (typeof conversationId !== 'string' || !conversationId.trim()) return undefined
  return conversationId.trim()
}

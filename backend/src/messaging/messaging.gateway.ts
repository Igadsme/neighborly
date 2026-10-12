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
import { readAccessToken } from '../auth/access-token'
import { accountSelect, isActiveAccount } from '../auth/account'

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
      void this.attachUser(socket).then(
        () => next(),
        error => next(error instanceof Error ? error : new Error('Unauthorized'))
      )
    })
  }

  async handleConnection(client: HandshakeSocket) {
    try {
      await this.attachUser(client)
    } catch {
      client.disconnect(true)
    }
  }

  /**
   * Joining a personal room is how the client receives unread counts and
   * notifications. It is authorized by the socket's own authenticated user,
   * so a client can only ever join its own room.
   */
  @SubscribeMessage('user.join')
  async joinUserRoom(@ConnectedSocket() client: HandshakeSocket) {
    const userId = client.data?.userId
    if (typeof userId !== 'string' || !userId) throw new WsException('Unauthorized')
    const tokenExp = client.data?.tokenExp
    if (typeof tokenExp === 'number' && tokenExp * 1000 <= Date.now()) {
      throw new WsException('Access token expired')
    }
    const account = await this.prisma.user.findUnique({ where: { id: userId }, select: accountSelect })
    if (!isActiveAccount(account)) throw new WsException('Account is not active')
    await client.join(`user:${userId}`)
    return { ok: true }
  }

  @SubscribeMessage('conversation.join')
  async joinConversation(@ConnectedSocket() client: HandshakeSocket, @MessageBody() body: unknown) {
    const userId = client.data?.userId
    if (typeof userId !== 'string' || !userId) throw new WsException('Unauthorized')

    const conversationId = conversationIdFrom(body)
    if (!conversationId) throw new WsException('Conversation id is required')

    // Room membership revalidates the session: an expired access
    // token or a deactivated account loses room access even on a
    // long-lived socket connection.
    const tokenExp = client.data?.tokenExp
    if (typeof tokenExp === 'number' && tokenExp * 1000 <= Date.now()) {
      throw new WsException('Access token expired')
    }
    const account = await this.prisma.user.findUnique({ where: { id: userId }, select: accountSelect })
    if (!isActiveAccount(account)) throw new WsException('Account is not active')

    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } }
    })
    if (!participant) throw new WsException('You are not a participant in this conversation')

    await client.join(`conversation:${conversationId}`)
    return { ok: true }
  }

  /**
   * Broadcasts to the conversation room.
   *
   * The sender receives the echo as well, because Socket.IO's `except`
   * filters by socket id and the gateway only knows the sender's user id.
   * That is safe: every message carries a stable id, and the client keys
   * rendered rows on it, so an echo of a message the sender already holds
   * cannot render twice.
   */
  publishMessage(conversationId: string, message: unknown) {
    this.server?.to(`conversation:${conversationId}`).emit('message.created', message)
  }

  /**
   * Unread counts are pushed per user, not per room, because a member may be
   * in several conversations and the badge is global. Each socket only ever
   * joins its own `user:<id>` room, which `attachUser` authorizes.
   */
  publishUnreadCounts(conversationId: string, counts: Array<{ userId: string; unreadCount: number }>) {
    for (const entry of counts) {
      this.server?.to(`user:${entry.userId}`).emit('conversation.unread', {
        conversationId,
        unreadCount: entry.unreadCount
      })
    }
  }

  /** In-app notification push to the single authorized recipient's room. */
  publishNotification(userId: string, notification: unknown) {
    this.server?.to(`user:${userId}`).emit('notification.created', notification)
  }

  private async attachUser(socket: HandshakeSocket) {
    socket.data = socket.data ?? {}
    socket.data.userId = undefined

    const token = tokenFrom(socket)
    if (!token) throw new Error('Unauthorized')

    const claims = readAccessToken(this.jwt, token)
    const account = await this.prisma.user.findUnique({ where: { id: claims.sub }, select: accountSelect })
    if (!isActiveAccount(account)) throw new Error('Unauthorized')
    socket.data.userId = claims.sub
    socket.data.tokenExp = claims.exp
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

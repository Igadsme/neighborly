import { JwtService } from '@nestjs/jwt'
import { ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets'
import { PrismaService } from '../prisma/prisma.service'
import { Server, Socket } from 'socket.io'

@WebSocketGateway({ namespace: '/realtime', cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? [] } })
export class MessagingGateway implements OnGatewayConnection {
  constructor(private readonly jwt: JwtService, private readonly prisma: PrismaService) {}

  @WebSocketServer()
  server!: Server

  async handleConnection(client: Socket) {
    const authToken = client.handshake.auth?.token
    const header = client.handshake.headers.authorization
    const token = typeof authToken === 'string'
      ? authToken
      : typeof header === 'string' && header.startsWith('Bearer ')
        ? header.slice(7)
        : ''
    if (!token) {
      client.disconnect(true)
      return
    }
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }> (token, { secret: process.env.JWT_SECRET })
      if (!payload.sub) {
        client.disconnect(true)
        return
      }
      client.data.userId = payload.sub
    } catch {
      client.disconnect(true)
    }
  }

  @SubscribeMessage('conversation.join')
  async joinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const userId = client.data.userId as string | undefined
    const conversationId = body?.conversationId
    if (!userId || !conversationId) return { ok: false }
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { conversationId: true },
    })
    if (!participant) return { ok: false }
    await client.join(`conversation:${conversationId}`)
    return { ok: true }
  }

  @SubscribeMessage('typing.start')
  typingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const conversationId = body?.conversationId
    if (client.data.userId && conversationId && client.rooms.has(`conversation:${conversationId}`)) {
      client.to(`conversation:${conversationId}`).emit('typing.started', {
        userId: client.data.userId,
        conversationId,
      })
    }
  }

  @SubscribeMessage('typing.stop')
  typingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const conversationId = body?.conversationId
    if (client.data.userId && conversationId && client.rooms.has(`conversation:${conversationId}`)) {
      client.to(`conversation:${conversationId}`).emit('typing.stopped', {
        userId: client.data.userId,
        conversationId,
      })
    }
  }

  publishMessage(conversationId: string, message: unknown) {
    this.server.to(`conversation:${conversationId}`).emit('message.created', message)
  }

  publishReadReceipt(conversationId: string, userId: string, lastReadAt: Date) {
    this.server.to(`conversation:${conversationId}`).emit('message.read', { conversationId, userId, lastReadAt })
  }
}

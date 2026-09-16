import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets'
import { Server } from 'socket.io'

@WebSocketGateway({ namespace: '/realtime', cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? [] } })
export class MessagingGateway {
  @WebSocketServer()
  server!: Server

  publishMessage(conversationId: string, message: unknown) {
    this.server.to(`conversation:${conversationId}`).emit('message.created', message)
  }
}

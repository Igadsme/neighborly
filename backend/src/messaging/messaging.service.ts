import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class MessagingService {
  constructor(private readonly prisma: PrismaService) {}

  listConversations(userId: string) {
    return this.prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      include: { participants: { include: { user: { include: { profile: true } } } }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { updatedAt: 'desc' }
    })
  }

  listMessages(userId: string, conversationId: string) {
    return this.assertParticipant(userId, conversationId).then(() =>
      this.prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } })
    )
  }

  async sendMessage(userId: string, conversationId: string, body: string) {
    await this.assertParticipant(userId, conversationId)
    return this.prisma.$transaction(async tx => {
      const message = await tx.message.create({ data: { conversationId, senderId: userId, body: body.trim() } })
      await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } })
      return message
    })
  }

  async markRead(userId: string, conversationId: string) {
    await this.assertParticipant(userId, conversationId)
    return this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() }
    })
  }

  private async assertParticipant(userId: string, conversationId: string) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } }
    })
    if (!participant) throw new ForbiddenException('You are not a participant in this conversation')
    return participant
  }
}

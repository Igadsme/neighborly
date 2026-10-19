import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { SafetyService } from '../safety/safety.service'

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly safety: SafetyService,
  ) {}

  listConversations(userId: string) {
    return this.prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      select: {
        id: true,
        updatedAt: true,
        participants: {
          select: {
            userId: true,
            lastReadAt: true,
            user: {
              select: {
                id: true,
                profile: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
        messages: {
          select: { id: true, conversationId: true, senderId: true, body: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' }
    })
  }

  async createConversation(userId: string, participantId: string) {
    if (userId === participantId) throw new BadRequestException('You cannot start a conversation with yourself')
    const participant = await this.prisma.user.findFirst({
      where: { id: participantId, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    })
    if (!participant) throw new NotFoundException('Neighbor not found')
    await this.safety.assertInteractionAllowed(userId, participantId)

    const directKey = [userId, participantId].sort().join(':')
    const direct = await this.prisma.conversation.findUnique({
      where: { directKey },
      include: { participants: true },
    })
    if (direct) return direct

    try {
      return await this.prisma.conversation.create({
        data: {
          directKey,
          participants: {
            create: [{ userId }, { userId: participantId }],
          },
        },
        include: { participants: true },
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const created = await this.prisma.conversation.findUnique({
          where: { directKey },
          include: { participants: true },
        })
        if (created) return created
      }
      throw error
    }
  }

  listMessages(userId: string, conversationId: string) {
    return this.assertParticipant(userId, conversationId).then(() =>
      this.prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } })
    )
  }

  async sendMessage(userId: string, conversationId: string, body: string) {
    await this.assertParticipant(userId, conversationId)
    const otherParticipants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, userId: { not: userId } },
      select: { userId: true },
    })
    await Promise.all(otherParticipants.map((participant) =>
      this.safety.assertInteractionAllowed(userId, participant.userId)))
    return this.prisma.$transaction(async tx => {
      const message = await tx.message.create({ data: { conversationId, senderId: userId, body: body.trim() } })
      await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } })
      const recipients = await tx.conversationParticipant.findMany({
        where: { conversationId, userId: { not: userId } },
        select: {
          userId: true,
          user: { select: { notificationPreference: { select: { messages: true } } } },
        },
      })
      await Promise.all(recipients
        .filter(recipient => recipient.user.notificationPreference?.messages ?? true)
        .map(recipient => this.notifications.createInTransaction(tx, {
          userId: recipient.userId,
          type: 'MESSAGE_RECEIVED',
          title: 'New message',
          body: 'You received a new message.',
          data: { conversationId },
        })))
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

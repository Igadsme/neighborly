import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { MessagingGateway } from './messaging.gateway'

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: MessagingGateway
  ) {}

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
    const message = await this.prisma.$transaction(async tx => {
      const created = await tx.message.create({ data: { conversationId, senderId: userId, body: body.trim() } })
      await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } })
      return created
    })
    this.realtime.publishMessage(conversationId, message)
    return message
  }

  async createConversation(userId: string, input: { participantId: string; body: string; listingId?: string }) {
    const body = input.body.trim()
    if (!body) throw new BadRequestException('Message body is required')
    if (input.participantId === userId) throw new BadRequestException('You cannot message yourself')

    const other = await this.prisma.user.findUnique({
      where: { id: input.participantId },
      select: { id: true, status: true, deletedAt: true }
    })
    if (!other || other.deletedAt || other.status === 'DELETED') throw new NotFoundException('User not found')
    if (other.status !== 'ACTIVE') throw new BadRequestException('This person cannot receive messages')

    if (input.listingId) {
      const listing = await this.prisma.listing.findUnique({
        where: { id: input.listingId },
        select: { id: true, sellerId: true, status: true, deletedAt: true }
      })
      if (!listing || listing.deletedAt || listing.status === 'DELETED') throw new NotFoundException('Listing not found')
      if (listing.status === 'DRAFT') throw new BadRequestException('This listing is not available')
      if (listing.sellerId !== input.participantId) {
        throw new ForbiddenException('You can only message the seller of this listing')
      }
    }

    const where = pairwiseConversationWhere(userId, input.participantId)
    const existing = await this.prisma.conversation.findFirst({ where, orderBy: { updatedAt: 'desc' } })
    let reused = Boolean(existing)
    const conversation = existing ?? await this.prisma.$transaction(async tx => {
      const raced = await tx.conversation.findFirst({ where, orderBy: { updatedAt: 'desc' } })
      if (raced) {
        reused = true
        return raced
      }
      return tx.conversation.create({
        data: {
          participants: {
            create: [{ userId }, { userId: input.participantId }]
          }
        }
      })
    })

    const message = await this.sendMessage(userId, conversation.id, body)
    return { conversation: { id: conversation.id }, message, reused }
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

/** A thread whose participants are exactly these two users. No listing column is required. */
function pairwiseConversationWhere(userId: string, otherUserId: string): Prisma.ConversationWhereInput {
  return {
    AND: [
      { participants: { some: { userId } } },
      { participants: { some: { userId: otherUserId } } },
      { participants: { every: { userId: { in: [userId, otherUserId] } } } }
    ]
  }
}

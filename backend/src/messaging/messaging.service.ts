import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { assertNotBlocked } from '../common/blocks'
import { publicUserSelect } from '../common/public-user.select'
import { sanitizeText } from '../common/text'
import { PrismaService } from '../prisma/prisma.service'
import { MessagingGateway } from './messaging.gateway'

function redactMessage<T extends { body: string; hiddenAt?: Date | null }>(message: T) {
  const { hiddenAt, ...rest } = message
  if (!hiddenAt) return rest
  return { ...rest, body: 'This message was removed' }
}

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: MessagingGateway
  ) {}

  async listConversations(userId: string) {
    const rows = await this.prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        participants: {
          select: {
            userId: true,
            lastReadAt: true,
            unreadCount: true,
            user: { select: publicUserSelect }
          }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, conversationId: true, senderId: true, body: true, createdAt: true, hiddenAt: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    })
    return rows.map(row => ({
      ...row,
      messages: row.messages.map(redactMessage),
      // Per-member unread for this conversation.
      unreadCount: row.participants.find(p => p.userId === userId)?.unreadCount ?? 0
    }))
  }

  /**
   * Message history, oldest page last.
   *
   * The page is capped at 100 rows and any row beyond the cap is dropped,
   * so a caller asking for a larger window receives a bounded page and can
   * ask again with `before`.
   *
   * Pagination is by `before` (a message id) rather than an offset, so a
   * message sent while someone is paging cannot shift a later page and cause
   * a row to be skipped or repeated. `before` is resolved to its timestamp,
   * and `hasMore` reports whether anything older remains.
   */
  async listMessages(
    userId: string,
    conversationId: string,
    options: { limit?: number; before?: string } = {}
  ) {
    await this.assertParticipant(userId, conversationId)
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)

    const anchor = options.before
      ? await this.prisma.message.findFirst({
          where: { id: options.before, conversationId },
          select: { createdAt: true }
        })
      : null
    // An id that does not belong to this conversation is treated as absent
    // rather than silently returning the whole history.
    if (options.before && !anchor) {
      throw new BadRequestException('Unknown message anchor for this conversation')
    }

    // One extra row tells us whether another page exists without a count.
    const rows = await this.prisma.message.findMany({
      where: { conversationId, ...(anchor ? { createdAt: { lt: anchor.createdAt } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit + 1
    })
    // Sorted here rather than trusting the driver, so the page order is a
    // property of this method and not of the adapter underneath it.
    const page = rows
      .slice(0, limit)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())

    const viewer = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { lastReadAt: true }
    })
    const lastReadAt = viewer?.lastReadAt ?? null

    return page.map(row => ({
      ...redactMessage(row),
      // A read receipt for the caller's own view: the viewer has seen this
      // message. It is the caller's own state, never another member's.
      readAt: lastReadAt && row.createdAt <= lastReadAt ? lastReadAt : null
    }))
  }

  /** Whether the newest page left older messages behind. */

  /**
   * Whether there is history older than `before`.
   *
   * With no anchor this answers "does this conversation have any history at
   * all", which is what the first load needs; afterwards the caller passes
   * the oldest id it holds.
   */
  async hasMoreMessages(userId: string, conversationId: string, before?: string) {
    await this.assertParticipant(userId, conversationId)
    const anchor = before
      ? await this.prisma.message.findFirst({
          where: { id: before, conversationId },
          select: { createdAt: true }
        })
      : null
    const count = await this.prisma.message.count({
      where: { conversationId, ...(anchor ? { createdAt: { lt: anchor.createdAt } } : {}) }
    })
    return count > 0
  }

  async sendMessage(userId: string, conversationId: string, body: string) {
    await this.assertParticipant(userId, conversationId)
    const others = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, NOT: { userId } },
      select: { userId: true }
    })
    for (const other of others) await assertNotBlocked(this.prisma, userId, other.userId)
    const clean = sanitizeText(body, 4000)
    if (!clean) throw new BadRequestException('Message body is required')
    const message = await this.prisma.$transaction(async tx => {
      const created = await tx.message.create({ data: { conversationId, senderId: userId, body: clean } })
      await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } })
      // Increment for the other participants only. Doing it here, in the same
      // transaction as the message, is what keeps the badge correct after a
      // crash: there is no window where a message exists uncounted.
      await tx.conversationParticipant.updateMany({
        where: { conversationId, NOT: { userId } },
        data: { unreadCount: { increment: 1 } }
      })
      return created
    })
    this.realtime.publishMessage(conversationId, message)
    // Realtime unread push so a second device updates without polling.
    await this.realtime.publishUnreadCounts(
      conversationId,
      (await this.prisma.conversationParticipant.findMany({
        where: { conversationId },
        select: { userId: true, unreadCount: true }
      })).map(row => ({ userId: row.userId, unreadCount: row.unreadCount }))
    )
    return message
  }

  async createConversation(userId: string, input: { participantId: string; body: string; listingId?: string }) {
    const body = sanitizeText(input.body, 4000)
    if (!body) throw new BadRequestException('Message body is required')
    if (input.participantId === userId) throw new BadRequestException('You cannot message yourself')

    const other = await this.prisma.user.findUnique({
      where: { id: input.participantId },
      select: { id: true, status: true, deletedAt: true }
    })
    if (!other || other.deletedAt || other.status === 'DELETED') throw new NotFoundException('User not found')
    if (other.status !== 'ACTIVE') throw new BadRequestException('This person cannot receive messages')
    await assertNotBlocked(this.prisma, userId, input.participantId)

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

  /**
   * Marks the caller's own conversation read. It cannot mark anyone else's,
   * because the row is keyed by (conversationId, userId).
   */
  async markRead(userId: string, conversationId: string) {
    await this.assertParticipant(userId, conversationId)
    const row = await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date(), unreadCount: 0 }
    })
    this.realtime.publishUnreadCounts(conversationId, [{ userId, unreadCount: 0 }])
    return row
  }

  /** Total unread across every conversation, for the global badge. */
  async unreadTotals(userId: string) {
    const row = await this.prisma.conversationParticipant.aggregate({
      where: { userId, unreadCount: { gt: 0 } },
      _sum: { unreadCount: true }
    })
    return { messages: row._sum.unreadCount ?? 0 }
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

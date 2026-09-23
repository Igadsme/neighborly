import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { publicUserSelect } from '../common/public-user.select'
import { cleanText } from '../common/text'
import { reactionEmojis } from '../common/vertical-values'
import { PrismaService } from '../prisma/prisma.service'
import {
  CreateCommentDto,
  CreateEventDto,
  CreateGiveawayDto,
  CreateLostFoundDto,
  CreatePostDto,
  ListLimitQuery,
  ListPostsQuery,
  ReactionDto,
  UpdateEventDto,
  UpdateGiveawayDto,
  UpdateLostFoundDto,
  UpdatePostDto
} from './dto'

const published = { status: 'PUBLISHED' as const, deletedAt: null }

const postSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  neighborhood: true,
  city: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  author: { select: publicUserSelect },
  reactions: { select: { emoji: true } },
  comments: { where: { deletedAt: null }, select: { id: true } }
} satisfies Prisma.CommunityPostSelect

const commentSelect = {
  id: true,
  postId: true,
  body: true,
  createdAt: true,
  author: { select: publicUserSelect }
} satisfies Prisma.CommunityCommentSelect

const eventSelect = {
  id: true,
  title: true,
  description: true,
  neighborhood: true,
  city: true,
  dateLabel: true,
  timeLabel: true,
  imageKey: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  organizer: { select: publicUserSelect },
  _count: { select: { rsvps: true } }
} satisfies Prisma.CommunityEventSelect

const lostSelect = {
  id: true,
  kind: true,
  item: true,
  neighborhood: true,
  city: true,
  imageKey: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  author: { select: publicUserSelect }
} satisfies Prisma.LostFoundItemSelect

const giveawaySelect = {
  id: true,
  item: true,
  neighborhood: true,
  city: true,
  claimed: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  author: { select: publicUserSelect }
} satisfies Prisma.GiveawaySelect

function reactionCounts(reactions: { emoji: string }[]) {
  return {
    like: reactions.filter(reaction => reaction.emoji === reactionEmojis[0]).length,
    love: reactions.filter(reaction => reaction.emoji === reactionEmojis[1]).length,
    wow: reactions.filter(reaction => reaction.emoji === reactionEmojis[2]).length
  }
}

function presentPost<T extends { reactions: { emoji: string }[]; comments: { id: string }[] }>(row: T) {
  const { reactions, comments, ...rest } = row
  return { ...rest, reactions: reactionCounts(reactions), replies: comments.length }
}

function presentEvent<T extends { imageKey: string | null; _count: { rsvps: number } }>(row: T) {
  const { imageKey, _count, ...rest } = row
  return { ...rest, image: imageKey, attending: _count.rsvps }
}

function presentLost<T extends { kind: string; imageKey: string | null }>(row: T) {
  const { kind, imageKey, ...rest } = row
  return { ...rest, type: kind, image: imageKey }
}

function presentGiveaway<T extends { author: unknown }>(row: T) {
  return row
}

@Injectable()
export class CommunityService {
  constructor(private readonly prisma: PrismaService) {}

  async listPosts(query: ListPostsQuery) {
    const rows = await this.prisma.communityPost.findMany({
      where: { ...published, ...(query.type ? { type: query.type } : {}) },
      select: postSelect,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset
    })
    return rows.map(presentPost)
  }

  async getPost(id: string) {
    const row = await this.prisma.communityPost.findFirst({ where: { id, ...published }, select: postSelect })
    if (!row) throw new NotFoundException('Community post not found')
    return presentPost(row)
  }

  async createPost(authorId: string, input: CreatePostDto) {
    const created = await this.prisma.communityPost.create({
      data: {
        authorId,
        type: input.type,
        title: input.title.trim(),
        body: input.body.trim(),
        neighborhood: input.neighborhood.trim(),
        city: cleanText(input.city),
        status: 'PUBLISHED'
      },
      select: postSelect
    })
    return presentPost(created)
  }

  async updatePost(userId: string, id: string, input: UpdatePostDto) {
    await this.requireAuthor(this.prisma.communityPost, id, userId, 'Community post not found', 'You can only change your own post')
    await this.prisma.communityPost.update({
      where: { id },
      data: {
        type: input.type,
        title: input.title?.trim(),
        body: input.body?.trim(),
        neighborhood: input.neighborhood?.trim(),
        city: cleanText(input.city)
      }
    })
    return this.getPost(id)
  }

  async archivePost(userId: string, id: string) {
    await this.requireAuthor(this.prisma.communityPost, id, userId, 'Community post not found', 'You can only change your own post')
    await this.prisma.communityPost.update({ where: { id }, data: { status: 'ARCHIVED', deletedAt: new Date() } })
    return { id, status: 'ARCHIVED' as const }
  }

  async react(userId: string, postId: string, input: ReactionDto) {
    await this.getPost(postId)
    const where = { postId_userId: { postId, userId } }
    const existing = await this.prisma.communityReaction.findUnique({ where })
    if (existing?.emoji === input.emoji) await this.prisma.communityReaction.delete({ where })
    else if (existing) await this.prisma.communityReaction.update({ where, data: { emoji: input.emoji } })
    else await this.prisma.communityReaction.create({ data: { postId, userId, emoji: input.emoji } })
    return this.getPost(postId)
  }

  listComments(postId: string) {
    return this.prisma.communityComment.findMany({
      where: { postId, deletedAt: null, post: published },
      select: commentSelect,
      orderBy: { createdAt: 'asc' }
    })
  }

  async createComment(userId: string, postId: string, input: CreateCommentDto) {
    await this.getPost(postId)
    return this.prisma.communityComment.create({
      data: { postId, authorId: userId, body: input.body.trim() },
      select: commentSelect
    })
  }

  async listEvents(query: ListLimitQuery) {
    const rows = await this.prisma.communityEvent.findMany({
      where: published,
      select: eventSelect,
      orderBy: { createdAt: 'asc' },
      take: query.limit,
      skip: query.offset
    })
    return rows.map(presentEvent)
  }

  async getEvent(id: string) {
    const row = await this.prisma.communityEvent.findFirst({ where: { id, ...published }, select: eventSelect })
    if (!row) throw new NotFoundException('Event not found')
    return presentEvent(row)
  }

  async createEvent(organizerId: string, input: CreateEventDto) {
    const created = await this.prisma.communityEvent.create({
      data: {
        organizerId,
        title: input.title.trim(),
        description: cleanText(input.description),
        neighborhood: input.neighborhood.trim(),
        city: cleanText(input.city),
        dateLabel: input.dateLabel.trim(),
        timeLabel: input.timeLabel.trim(),
        imageKey: cleanText(input.imageKey),
        status: 'PUBLISHED'
      },
      select: eventSelect
    })
    return presentEvent(created)
  }

  async updateEvent(userId: string, id: string, input: UpdateEventDto) {
    await this.requireOrganizer(id, userId)
    await this.prisma.communityEvent.update({
      where: { id },
      data: {
        title: input.title?.trim(),
        description: cleanText(input.description),
        neighborhood: input.neighborhood?.trim(),
        city: cleanText(input.city),
        dateLabel: input.dateLabel?.trim(),
        timeLabel: input.timeLabel?.trim(),
        imageKey: cleanText(input.imageKey)
      }
    })
    return this.getEvent(id)
  }

  async archiveEvent(userId: string, id: string) {
    await this.requireOrganizer(id, userId)
    await this.prisma.communityEvent.update({ where: { id }, data: { status: 'ARCHIVED', deletedAt: new Date() } })
    return { id, status: 'ARCHIVED' as const }
  }

  async toggleRsvp(userId: string, eventId: string) {
    await this.getEvent(eventId)
    const where = { eventId_userId: { eventId, userId } }
    const existing = await this.prisma.communityEventRsvp.findUnique({ where })
    if (existing) await this.prisma.communityEventRsvp.delete({ where })
    else await this.prisma.communityEventRsvp.create({ data: { eventId, userId } })
    const event = await this.getEvent(eventId)
    return { attending: !existing, attendingCount: event.attending }
  }

  async listLostFound(query: ListLimitQuery) {
    const rows = await this.prisma.lostFoundItem.findMany({
      where: published,
      select: lostSelect,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset
    })
    return rows.map(presentLost)
  }

  async getLostFound(id: string) {
    const row = await this.prisma.lostFoundItem.findFirst({ where: { id, ...published }, select: lostSelect })
    if (!row) throw new NotFoundException('Lost and found item not found')
    return presentLost(row)
  }

  async createLostFound(authorId: string, input: CreateLostFoundDto) {
    const created = await this.prisma.lostFoundItem.create({
      data: {
        authorId,
        kind: input.type,
        item: input.item.trim(),
        neighborhood: input.neighborhood.trim(),
        city: cleanText(input.city),
        imageKey: cleanText(input.imageKey),
        status: 'PUBLISHED'
      },
      select: lostSelect
    })
    return presentLost(created)
  }

  async updateLostFound(userId: string, id: string, input: UpdateLostFoundDto) {
    await this.requireAuthor(this.prisma.lostFoundItem, id, userId, 'Lost and found item not found', 'You can only change your own lost and found post')
    await this.prisma.lostFoundItem.update({
      where: { id },
      data: {
        kind: input.type,
        item: input.item?.trim(),
        neighborhood: input.neighborhood?.trim(),
        city: cleanText(input.city),
        imageKey: cleanText(input.imageKey)
      }
    })
    return this.getLostFound(id)
  }

  async archiveLostFound(userId: string, id: string) {
    await this.requireAuthor(this.prisma.lostFoundItem, id, userId, 'Lost and found item not found', 'You can only change your own lost and found post')
    await this.prisma.lostFoundItem.update({ where: { id }, data: { status: 'ARCHIVED', deletedAt: new Date() } })
    return { id, status: 'ARCHIVED' as const }
  }

  async listGiveaways(query: ListLimitQuery) {
    const rows = await this.prisma.giveaway.findMany({
      where: published,
      select: giveawaySelect,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset
    })
    return rows.map(presentGiveaway)
  }

  async getGiveaway(id: string) {
    const row = await this.prisma.giveaway.findFirst({ where: { id, ...published }, select: giveawaySelect })
    if (!row) throw new NotFoundException('Giveaway not found')
    return presentGiveaway(row)
  }

  async createGiveaway(authorId: string, input: CreateGiveawayDto) {
    const created = await this.prisma.giveaway.create({
      data: {
        authorId,
        item: input.item.trim(),
        neighborhood: input.neighborhood.trim(),
        city: cleanText(input.city),
        status: 'PUBLISHED'
      },
      select: giveawaySelect
    })
    return presentGiveaway(created)
  }

  async updateGiveaway(userId: string, id: string, input: UpdateGiveawayDto) {
    await this.requireAuthor(this.prisma.giveaway, id, userId, 'Giveaway not found', 'You can only change your own giveaway')
    await this.prisma.giveaway.update({
      where: { id },
      data: {
        item: input.item?.trim(),
        neighborhood: input.neighborhood?.trim(),
        city: cleanText(input.city)
      }
    })
    return this.getGiveaway(id)
  }

  async archiveGiveaway(userId: string, id: string) {
    await this.requireAuthor(this.prisma.giveaway, id, userId, 'Giveaway not found', 'You can only change your own giveaway')
    await this.prisma.giveaway.update({ where: { id }, data: { status: 'ARCHIVED', deletedAt: new Date() } })
    return { id, status: 'ARCHIVED' as const }
  }

  async claimGiveaway(userId: string, id: string) {
    const updated = await this.prisma.giveaway.updateMany({
      where: { id, claimed: false, ...published },
      data: { claimed: true, claimedById: userId }
    })
    if (updated.count === 0) {
      const existing = await this.prisma.giveaway.findUnique({
        where: { id },
        select: { claimed: true, claimedById: true, deletedAt: true, status: true }
      })
      if (!existing || existing.deletedAt || existing.status !== 'PUBLISHED') throw new NotFoundException('Giveaway not found')
      if (existing.claimed && existing.claimedById === userId) return { claimed: true, giveaway: await this.getGiveaway(id) }
      if (existing.claimed) throw new ConflictException('This giveaway has already been claimed')
      throw new NotFoundException('Giveaway not found')
    }
    return { claimed: true, giveaway: await this.getGiveaway(id) }
  }

  private async requireOrganizer(id: string, userId: string) {
    const row = await this.prisma.communityEvent.findUnique({ where: { id }, select: { organizerId: true, deletedAt: true } })
    if (!row || row.deletedAt) throw new NotFoundException('Event not found')
    if (row.organizerId !== userId) throw new ForbiddenException('You can only change your own event')
  }

  private async requireAuthor(
    model: { findUnique: (args: { where: { id: string }; select: { authorId: true; deletedAt: true } }) => Promise<{ authorId: string; deletedAt: Date | null } | null> },
    id: string,
    userId: string,
    missing: string,
    forbidden: string
  ) {
    const row = await model.findUnique({ where: { id }, select: { authorId: true, deletedAt: true } })
    if (!row || row.deletedAt) throw new NotFoundException(missing)
    if (row.authorId !== userId) throw new ForbiddenException(forbidden)
  }
}

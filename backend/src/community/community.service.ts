import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CommunityQueryDto, CreateCommentDto, CreateEventDto, CreatePostDto, ReactToPostDto, RsvpDto } from './dto'

@Injectable()
export class CommunityService {
  constructor(private readonly prisma: PrismaService) {}

  async listPosts(userId: string, query: CommunityQueryDto) {
    const blockedIds = await this.blockedIds(userId)
    const posts = await this.prisma.communityPost.findMany({
      where: {
        deletedAt: null,
        neighborhood: query.neighborhood || undefined,
        authorId: blockedIds.length ? { notIn: blockedIds } : undefined,
      },
      select: {
        id: true,
        body: true,
        neighborhood: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: {
            id: true,
            profile: { select: { firstName: true, displayName: true, neighborhood: true } },
          },
        },
        reactions: { select: { userId: true, type: true } },
        comments: {
          where: { deletedAt: null, authorId: blockedIds.length ? { notIn: blockedIds } : undefined },
          select: {
            id: true,
            body: true,
            createdAt: true,
            author: { select: { id: true, profile: { select: { firstName: true, displayName: true } } } },
          },
          orderBy: { createdAt: 'asc' },
          take: 50,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset,
    })
    return posts.map((post) => ({
      ...post,
      reactionCounts: post.reactions.reduce<Record<string, number>>((counts, reaction) => {
        counts[reaction.type] = (counts[reaction.type] ?? 0) + 1
        return counts
      }, {}),
      viewerReactions: post.reactions.filter((reaction) => reaction.userId === userId).map((reaction) => reaction.type),
      reactions: undefined,
    }))
  }

  async createPost(userId: string, input: CreatePostDto) {
    const neighborhood = input.neighborhood?.trim() || await this.userNeighborhood(userId)
    return this.prisma.communityPost.create({
      data: { authorId: userId, body: input.body.trim(), neighborhood },
    })
  }

  async comment(userId: string, postId: string, input: CreateCommentDto) {
    const post = await this.prisma.communityPost.findFirst({
      where: { id: postId, deletedAt: null },
      select: { authorId: true },
    })
    if (!post) throw new NotFoundException('Community post not found')
    await this.assertNotBlocked(userId, post.authorId)
    return this.prisma.communityComment.create({
      data: { postId, authorId: userId, body: input.body.trim() },
      include: { author: { select: { id: true, profile: true } } },
    })
  }

  async react(userId: string, postId: string, input: ReactToPostDto) {
    const post = await this.prisma.communityPost.findFirst({
      where: { id: postId, deletedAt: null },
      select: { authorId: true },
    })
    if (!post) throw new NotFoundException('Community post not found')
    await this.assertNotBlocked(userId, post.authorId)
    const key = { postId_userId_type: { postId, userId, type: input.type } }
    const existing = await this.prisma.postReaction.findUnique({ where: key })
    if (existing) {
      await this.prisma.postReaction.delete({ where: key })
      return { active: false, type: input.type }
    }
    await this.prisma.postReaction.create({ data: { postId, userId, type: input.type } })
    return { active: true, type: input.type }
  }

  async deletePost(userId: string, postId: string) {
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId } })
    if (!post || post.deletedAt) throw new NotFoundException('Community post not found')
    if (post.authorId !== userId) throw new ForbiddenException()
    await this.prisma.communityPost.update({ where: { id: postId }, data: { deletedAt: new Date() } })
    return { deleted: true }
  }

  async listEvents(userId: string, query: CommunityQueryDto) {
    const blockedIds = await this.blockedIds(userId)
    const events = await this.prisma.communityEvent.findMany({
      where: {
        status: 'PUBLISHED',
        startsAt: { gte: new Date() },
        neighborhood: query.neighborhood || undefined,
        organizerId: blockedIds.length ? { notIn: blockedIds } : undefined,
      },
      select: {
        id: true,
        title: true,
        description: true,
        neighborhood: true,
        location: true,
        startsAt: true,
        endsAt: true,
        capacity: true,
        status: true,
        organizer: { select: { id: true, profile: { select: { firstName: true, displayName: true } } } },
        rsvps: { select: { userId: true, status: true } },
      },
      orderBy: { startsAt: 'asc' },
      take: query.limit,
      skip: query.offset,
    })
    return events.map((event) => ({
      ...event,
      goingCount: event.rsvps.filter((rsvp) => rsvp.status === 'GOING').length,
      viewerRsvp: event.rsvps.find((rsvp) => rsvp.userId === userId)?.status ?? null,
      rsvps: undefined,
    }))
  }

  async createEvent(userId: string, input: CreateEventDto) {
    const startsAt = new Date(input.startsAt)
    const endsAt = input.endsAt ? new Date(input.endsAt) : undefined
    if (startsAt <= new Date()) throw new BadRequestException('Event must start in the future')
    if (endsAt && endsAt <= startsAt) throw new BadRequestException('Event end must be after its start')
    return this.prisma.communityEvent.create({
      data: {
        organizerId: userId,
        title: input.title.trim(),
        description: input.description.trim(),
        neighborhood: input.neighborhood?.trim() || await this.userNeighborhood(userId),
        location: input.location.trim(),
        startsAt,
        endsAt,
        capacity: input.capacity,
      },
    })
  }

  async rsvp(userId: string, eventId: string, input: RsvpDto) {
    const event = await this.prisma.communityEvent.findFirst({
      where: { id: eventId, status: 'PUBLISHED', startsAt: { gt: new Date() } },
      include: { rsvps: { where: { status: 'GOING' }, select: { userId: true } } },
    })
    if (!event) throw new NotFoundException('Upcoming event not found')
    await this.assertNotBlocked(userId, event.organizerId)
    const alreadyGoing = event.rsvps.some((rsvp) => rsvp.userId === userId)
    if (input.status === 'GOING' && !alreadyGoing && event.capacity && event.rsvps.length >= event.capacity) {
      throw new BadRequestException('This event is full')
    }
    return this.prisma.eventRsvp.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId, status: input.status },
      update: { status: input.status },
    })
  }

  async cancelEvent(userId: string, eventId: string) {
    const event = await this.prisma.communityEvent.findUnique({ where: { id: eventId } })
    if (!event) throw new NotFoundException('Event not found')
    if (event.organizerId !== userId) throw new ForbiddenException()
    await this.prisma.communityEvent.update({ where: { id: eventId }, data: { status: 'CANCELLED' } })
    return { cancelled: true }
  }

  private async userNeighborhood(userId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId }, select: { neighborhood: true } })
    return profile?.neighborhood ?? undefined
  }

  private async blockedIds(userId: string) {
    const blocks = await this.prisma.blockedUser.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    })
    return blocks.map((block) => block.blockerId === userId ? block.blockedId : block.blockerId)
  }

  private async assertNotBlocked(firstUserId: string, secondUserId: string) {
    if (firstUserId === secondUserId) return
    const block = await this.prisma.blockedUser.findFirst({
      where: { OR: [
        { blockerId: firstUserId, blockedId: secondUserId },
        { blockerId: secondUserId, blockedId: firstUserId },
      ] },
    })
    if (block) throw new ForbiddenException('This interaction is unavailable')
  }
}

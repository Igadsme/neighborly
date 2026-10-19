import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CommunityService } from './community.service'

describe('CommunityService', () => {
  const communityPost = { findMany: jest.fn(), findFirst: jest.fn() }
  const blockedUser = { findMany: jest.fn(), findFirst: jest.fn() }
  const communityEvent = { findFirst: jest.fn() }
  const eventRsvp = { upsert: jest.fn() }
  const service = new CommunityService({
    communityPost,
    blockedUser,
    communityEvent,
    eventRsvp,
  } as unknown as PrismaService)

  beforeEach(() => {
    jest.clearAllMocks()
    blockedUser.findMany.mockResolvedValue([])
  })

  it('aggregates reactions and identifies the viewer reactions', async () => {
    communityPost.findMany.mockResolvedValue([{ id: 'post', reactions: [
      { userId: 'viewer', type: 'HELPFUL' },
      { userId: 'other', type: 'HELPFUL' },
      { userId: 'other', type: 'LIKE' },
    ], comments: [] }])
    const [post] = await service.listPosts('viewer', { limit: 25, offset: 0 })
    expect(post.reactionCounts).toEqual({ HELPFUL: 2, LIKE: 1 })
    expect(post.viewerReactions).toEqual(['HELPFUL'])
  })

  it('rejects interaction when either neighbor has blocked the other', async () => {
    communityPost.findFirst.mockResolvedValue({ authorId: 'author' })
    blockedUser.findFirst.mockResolvedValue({ blockerId: 'author' })
    await expect(service.comment('viewer', 'post', { body: 'hello' })).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('enforces an event capacity without rejecting an existing attendee', async () => {
    communityEvent.findFirst.mockResolvedValue({
      organizerId: 'organizer',
      capacity: 1,
      rsvps: [{ userId: 'someone-else' }],
    })
    blockedUser.findFirst.mockResolvedValue(null)
    await expect(service.rsvp('viewer', 'event', { status: 'GOING' })).rejects.toBeInstanceOf(BadRequestException)
    expect(eventRsvp.upsert).not.toHaveBeenCalled()
  })
})

